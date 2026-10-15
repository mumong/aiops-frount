import type { ChatMessage, NodeBlock, SSEMessage, RemediationApproval, EndpointMode, ParallelEvidenceGroup } from './types'
import { chunkAddsRemediationMarker, hasRemediationApprovalMarker, parseRemediationApprovalText, toRemediationApproval } from './remediationParsing'
import { shouldProcessRemediation } from './chatRequestPolicy'
import { applyNodeReasoning, applyNodeThinkingEvent, mergeAnalysisStream, finishNodeToolCall, startNodeBlock, startNodeToolCall, setNodeRuntimeStatus, settleNodeBlocks } from './nodeBlockUpdates'
import { presentToolEvent } from './toolPresentation'
import { presentRoute } from './routePresentation'
import { NODE_ID, SSE_EVENT, THINKING_TYPE, TRANSPORT_EVENT, isModelErrorCode, textField, trimmedField, type SSEPayload } from './sseEvents'
import {
  completeParallelEvidence,
  applyParallelOutcomes,
  createParallelEvidenceState,
  extractParallelEvidenceGroups,
  finishParallelTool,
  parseParallelEvidenceStreamContext,
  resolveParallelResultData,
  shouldRouteOnlyToParallelBoard,
  startParallelTool,
} from './parallelEvidenceModel'

export interface ChatEventState {
  nodeBlocks: NodeBlock[]
  parallelGroups: ParallelEvidenceGroup[]
  textBuffer: string
  toolIdCounter: number
  /** textBuffer contains an approval marker; until then text chunks skip approval parsing. */
  approvalMarkerSeen?: boolean
}

export interface ChatEventTransition extends ChatEventState {
  messageUpdates: Array<(messages: ChatMessage[]) => ChatMessage[]>
  finalAnswer?: string
  streaming?: boolean
  /** A final/error event was applied: render immediately instead of waiting for a frame. */
  terminal?: boolean
}

/**
 * The SSE body ended while the reply was still streaming, i.e. without a
 * final or error event. Keep the progress (node snapshot) and flag the
 * message so the UI can say the connection was interrupted. User-initiated
 * stops never reach this path.
 */
export function markStreamInterrupted(
  messages: ChatMessage[],
  assistantId: string,
  nodeBlocks: NodeBlock[],
): ChatMessage[] {
  let changed = false
  const next = messages.map(message => {
    if (message.id !== assistantId || message.status !== 'streaming') return message
    changed = true
    return { ...message, status: 'complete' as const, interrupted: true, nodeBlocks }
  })
  return changed ? next : messages
}

function mirrorParallelEvidence(
  blocks: NodeBlock[],
  updater: (state: NonNullable<NodeBlock['parallelEvidence']>) => NonNullable<NodeBlock['parallelEvidence']>,
): NodeBlock[] {
  let mirrored = false
  const next = blocks.map(block => {
    if (block.nodeId !== NODE_ID.PARALLEL_EVIDENCE || !block.parallelEvidence) return block
    mirrored = true
    return { ...block, parallelEvidence: updater(block.parallelEvidence) }
  })
  return mirrored ? next : blocks
}

/**
 * Pure event transition. Message updates remain ordered so React can apply them
 * against its latest queued state. Clocks and current run state are explicit;
 * fetch, history persistence and synchronous ref publication stay in the hook.
 */
export function transitionChatEvent(
  state: ChatEventState,
  msg: SSEMessage,
  assistantId: string,
  requestEndpointMode: EndpointMode,
  now: number,
): ChatEventTransition {
  let nodeBlocks = state.nodeBlocks
  let parallelGroups = state.parallelGroups
  let textBuffer = state.textBuffer
  let toolIdCounter = state.toolIdCounter
  let approvalMarkerSeen = state.approvalMarkerSeen ?? false
  let terminal = false
  const messageUpdates: ChatEventTransition['messageUpdates'] = []
  let finalAnswer: string | undefined
  let streaming: boolean | undefined
  const queueMessageUpdate = (update: (messages: ChatMessage[]) => ChatMessage[]) => { messageUpdates.push(update) }
  const setFinalAnswer = (answer: string) => { finalAnswer = answer }
  const setIsStreaming = (active: boolean) => { streaming = active }
  const updateNodeBlocks = (update: (blocks: NodeBlock[]) => NodeBlock[]) => {
    nodeBlocks = update(nodeBlocks)
  }
  const result = (): ChatEventTransition => ({
    nodeBlocks,
    parallelGroups,
    textBuffer,
    toolIdCounter,
    approvalMarkerSeen,
    messageUpdates,
    ...(finalAnswer !== undefined ? { finalAnswer } : {}),
    ...(streaming !== undefined ? { streaming } : {}),
    ...(terminal ? { terminal } : {}),
  })

  const upsertRemediationApproval = (assistantId: string, approval: RemediationApproval) => {
    queueMessageUpdate(prev =>
      prev.map(m => {
        if (m.id !== assistantId) return m
        const existing = m.remediationApprovals ?? []
        const existingIndex = existing.findIndex(item => item.approvalId === approval.approvalId)
        const remediationApprovals =
          existingIndex >= 0
            ? existing.map((item, index) => index === existingIndex ? { ...item, ...approval } : item)
            : [...existing, approval]

        return {
          ...m,
          runId: m.runId || approval.runId,
          remediationApprovals,
        }
      })
    )
  }

  const parseAndShowTextApproval = (assistantId: string, text: string, endpointMode: EndpointMode) => {
    if (!shouldProcessRemediation(endpointMode)) return
    const parsed = parseRemediationApprovalText(text)
    if (!parsed) return
    upsertRemediationApproval(assistantId, toRemediationApproval(parsed, now))
  }

  const appendTextStreamChunk = (assistantId: string, chunk: string, endpointMode: EndpointMode) => {
    // The parser returns null without a marker, so skipping it until one has
    // streamed in avoids re-scanning the whole growing text on every token.
    approvalMarkerSeen ||= chunkAddsRemediationMarker(textBuffer, chunk)
    textBuffer += chunk
    const nextContent = textBuffer
    setFinalAnswer(nextContent)
    queueMessageUpdate(prev =>
      prev.map(m =>
        m.id === assistantId
          ? { ...m, content: nextContent }
          : m
      )
    )
    if (approvalMarkerSeen) parseAndShowTextApproval(assistantId, nextContent, endpointMode)
  }

  if (msg.event === TRANSPORT_EVENT.TEXT) {
    appendTextStreamChunk(assistantId, msg.data, requestEndpointMode)
    return result()
  }

  let data: SSEPayload
  try {
    data = JSON.parse(msg.data)
  } catch {
    appendTextStreamChunk(assistantId, msg.data, requestEndpointMode)
    return result()
  }

  const eventType = msg.event === TRANSPORT_EVENT.MESSAGE && typeof data.type === 'string'
    ? data.type
    : msg.event

  switch (eventType) {
    case SSE_EVENT.RUN_START:
      queueMessageUpdate(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, runId: textField(data, 'run_id') } : m
        )
      )
      break

    case SSE_EVENT.NODE_START: {
      const nodeId = textField(data, 'node')
      const nodeName = textField(data, ['node_name', 'node'])
      updateNodeBlocks(prev => {
        const started = startNodeBlock(prev, nodeId, nodeName)
        if (nodeId !== NODE_ID.PARALLEL_EVIDENCE || parallelGroups.length < 2) {
          return started
        }
        return started.map(block => (
          block.nodeId === nodeId && !block.parallelEvidence
            ? { ...block, parallelEvidence: createParallelEvidenceState(parallelGroups) }
            : block
        ))
      })
      break
    }

    case SSE_EVENT.THINKING: {
      const thinkType = textField(data, 'thinking_type')
      const nodeId = textField(data, 'node')
      const nodeName = textField(data, ['node_name', 'node'])

      if (thinkType === THINKING_TYPE.RUNTIME_STATUS) {
        const groupId = textField(data, 'parallel_group_id')
        if (groupId) {
          updateNodeBlocks(prev => prev.map(block => !block.parallelEvidence ? block : {
            ...block, parallelEvidence: {...block.parallelEvidence,
              groups: block.parallelEvidence.groups.map(group => group.groupId !== groupId ? group : {
                ...group, runtimeStatus: textField(data, 'content'),
              })},
          }))
        } else {
          updateNodeBlocks(prev => setNodeRuntimeStatus(prev, nodeId, nodeName,
            textField(data, 'content'), textField(data, 'status', 'running'), now))
        }
      } else if (thinkType === THINKING_TYPE.AI_TOKEN || thinkType === THINKING_TYPE.AI_MESSAGE) {
        const content = textField(data, thinkType === THINKING_TYPE.AI_MESSAGE ? ['full_content', 'content'] : 'content')
        const groupId = textField(data, 'parallel_group_id')
        const stage = textField(data, 'lane_stage', 'evidence')
        if (groupId) {
          updateNodeBlocks(prev => mirrorParallelEvidence(prev, board => ({ ...board,
            groups: board.groups.map(group => group.groupId !== groupId ? group : { ...group,
              analysisStreams: { ...group.analysisStreams,
                [stage]: mergeAnalysisStream(group.analysisStreams?.[stage], thinkType, content) },
            }),
          })))
        } else {
          updateNodeBlocks(prev => applyNodeThinkingEvent(prev, nodeId, nodeName, thinkType, content))
        }
      } else if (thinkType === THINKING_TYPE.AI_REASONING) {
        const content = textField(data, 'content')
        const groupId = textField(data, 'parallel_group_id')
        const stage = textField(data, 'lane_stage', 'evidence')
        if (groupId) {
          updateNodeBlocks(prev => mirrorParallelEvidence(prev, board => ({ ...board,
            groups: board.groups.map(group => group.groupId !== groupId ? group : { ...group,
              reasoningStreams: { ...group.reasoningStreams,
                [stage]: (group.reasoningStreams?.[stage] || '') + content },
            }),
          })))
        } else {
          updateNodeBlocks(prev => applyNodeReasoning(prev, nodeId, nodeName, content))
        }
      } else if (thinkType === THINKING_TYPE.TOOL_START) {
        const toolName = textField(data, 'tool_name')
        const backendCallId = trimmedField(data, 'tool_call_id')
        const evidenceContext = parseParallelEvidenceStreamContext(data.evidence_context)
        const tool = {
          id: `tool-${++toolIdCounter}`,
          ...(backendCallId ? { backendCallId } : {}),
          ...(evidenceContext ? { evidenceContext } : {}),
          toolName,
          status: 'running' as const,
        }
        updateNodeBlocks(prev => {
          const isGroupedEvidence = parallelGroups.length >= 2
            && (nodeId === NODE_ID.PARALLEL_EVIDENCE || nodeId === NODE_ID.EVIDENCE)
          const mirrored = isGroupedEvidence
            ? mirrorParallelEvidence(prev, state => startParallelTool(state, tool))
            : prev
          if (shouldRouteOnlyToParallelBoard(
            nodeId,
            evidenceContext,
            mirrored !== prev,
          )) {
            return mirrored
          }
          return startNodeToolCall(mirrored, nodeId, nodeName, tool)
        })
      } else if (thinkType === THINKING_TYPE.TOOL_RESULT) {
        const toolName = textField(data, 'tool_name')
        const status = data.semantic_success === false ? 'error' : textField(data, 'status', 'success')
        const presentation = presentToolEvent(data)
        const preview = presentation.preview
        const resultData = presentation.detail
        const parallelResultData = resolveParallelResultData(data)
        const toolCallId = trimmedField(data, 'tool_call_id')
        const evidenceContext = parseParallelEvidenceStreamContext(data.evidence_context)
        const semanticSuccess = typeof data.semantic_success === 'boolean'
          ? data.semantic_success
          : undefined
        const rawRef = trimmedField(data, 'raw_ref')
        const structuredRef = trimmedField(data, 'structured_ref')
        const summaryRef = trimmedField(data, 'summary_ref')
        updateNodeBlocks(prev => {
          const isGroupedEvidence = parallelGroups.length >= 2
            && (nodeId === NODE_ID.PARALLEL_EVIDENCE || nodeId === NODE_ID.EVIDENCE)
          const fallbackId = `tool-result-${++toolIdCounter}`
          const mirrored = isGroupedEvidence
            ? mirrorParallelEvidence(prev, state => finishParallelTool(
                state,
                toolName,
                status,
                preview,
                parallelResultData,
                fallbackId,
                {
                  ...(toolCallId ? { toolCallId } : {}),
                  ...(evidenceContext ? { evidenceContext } : {}),
                  ...(semanticSuccess !== undefined ? { semanticSuccess } : {}),
                  ...(rawRef ? { rawRef } : {}),
                  ...(structuredRef ? { structuredRef } : {}),
                  ...(summaryRef ? { summaryRef } : {}),
                },
              ))
            : prev
          if (shouldRouteOnlyToParallelBoard(
            nodeId,
            evidenceContext,
            mirrored !== prev,
          )) {
            return mirrored
          }
          return finishNodeToolCall(mirrored, nodeId, nodeName, toolName, status, preview, resultData, toolCallId)
        })
      }
      break
    }

    case SSE_EVENT.HEARTBEAT:
      break

    case SSE_EVENT.NODE_COMPLETE: {
      const nodeId = textField(data, 'node')
      const duration = Number(data.duration_seconds || 0)
      const handoff = textField(data, 'handoff_summary')
      if (nodeId === NODE_ID.LAYER) {
        parallelGroups = extractParallelEvidenceGroups(
          data.state_snapshot as Record<string, unknown> | undefined,
        )
      }
      updateNodeBlocks(prev => prev.map(n => {
        if (n.nodeId === nodeId) {
          return {
            ...n,
            status: 'complete' as const,
            runtimeStatus: undefined,
            durationSeconds: duration,
            handoffSummary: handoff || n.handoffSummary,
            ...(nodeId === NODE_ID.REQUEST_ROUTER
              ? { routeDecision: presentRoute(data.state_snapshot) } : {}),
            ...(n.parallelEvidence
              ? { parallelEvidence: applyParallelOutcomes(completeParallelEvidence(n.parallelEvidence), data.state_snapshot) }
              : {}),
          }
        }
        if (
          nodeId === NODE_ID.EVIDENCE
          && parallelGroups.length >= 2
          && n.parallelEvidence
        ) {
          return { ...n, parallelEvidence: completeParallelEvidence(n.parallelEvidence) }
        }
        return n
      }))
      break
    }

    case SSE_EVENT.FINAL: {
      updateNodeBlocks(prev => settleNodeBlocks(prev, 'complete'))
      const answer = textField(data, 'answer')
      setFinalAnswer(answer)
      textBuffer = answer
      approvalMarkerSeen = hasRemediationApprovalMarker(answer)
      terminal = true
      // Take a snapshot of current nodeBlocks and store them on the message
      // so they survive when the next message is sent
      const snapshot = nodeBlocks
      queueMessageUpdate(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: answer, status: 'complete' as const,
                resultStatus: data.status === 'partial' ? 'partial' as const : data.status === 'error' ? 'error' as const : 'success' as const,
                repairRecord: data.repair_record as ChatMessage['repairRecord'],
                repairPlan: data.repair_plan as ChatMessage['repairPlan'],
                diagnosisCases: data.diagnosis_cases as ChatMessage['diagnosisCases'],
                diagnosisOverview: data.diagnosis_overview as ChatMessage['diagnosisOverview'],
                diagnosisFooter: data.diagnosis_footer as ChatMessage['diagnosisFooter'],
                nodeBlocks: snapshot }
            : m
        )
      )
      parseAndShowTextApproval(assistantId, answer, requestEndpointMode)
      break
    }

    case SSE_EVENT.ERROR: {
      updateNodeBlocks(prev => settleNodeBlocks(prev, 'stopped'))
      const errorMsg = textField(data, 'error', '未知错误')
      const errorCode = textField(data, 'error_code')
      if (isModelErrorCode(errorCode)) {
        // The model/gateway failed, not the workflow: keep the progress visible
        // and explain the failure instead of replacing the message with an error.
        const blocks = nodeBlocks
        setFinalAnswer('')
        queueMessageUpdate(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, status: 'complete' as const, nodeBlocks: blocks, modelFailure: { code: errorCode, message: errorMsg } }
              : m
          )
        )
      } else {
        setFinalAnswer(`❌ ${errorMsg}`)
        queueMessageUpdate(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, status: 'error' as const, content: `❌ ${errorMsg}` }
              : m
          )
        )
      }
      setIsStreaming(false)
      terminal = true
      break
    }

    case SSE_EVENT.REMEDIATION_APPROVAL_REQUIRED: {
      if (!shouldProcessRemediation(requestEndpointMode)) break
      const approval: RemediationApproval = {
        type: textField(data, 'approval_kind', 'plan') as RemediationApproval['type'],
        approvalId: textField(data, 'approval_id'),
        runId: textField(data, 'run_id'),
        title: textField(data, 'title', '修复审批'),
        description: textField(data, 'description'),
        payload: data.payload as Record<string, unknown> | undefined,
        requestedAt: now,
        expiresAt: typeof data.expires_at === 'number' && typeof data.server_time === 'number'
          ? now + Math.max(0, data.expires_at - data.server_time) * 1000 : undefined,
      }
      upsertRemediationApproval(assistantId, approval)
      break
    }

    case SSE_EVENT.REMEDIATION_TOOL_START:
    case SSE_EVENT.REMEDIATION_TOOL_RESULT: {
      const result = {
        key: [data.run_id, data.group_id, data.action_id, data.stage].join(':'),
        groupId: textField(data, 'group_id'), actionId: textField(data, 'action_id'),
        stage: textField(data, 'stage'), command: textField(data, 'command'),
        status: textField(data, 'status'), result: textField(data, 'result_preview'),
        truncated: data.result_truncated === true,
      }
      queueMessageUpdate(prev => prev.map(m => m.id === assistantId ? {
        ...m, remediationResults: [...(m.remediationResults || []).filter(r => r.key !== result.key), result],
      } : m))
      break
    }

    case SSE_EVENT.REMEDIATION_FINISHED: {
      if (!shouldProcessRemediation(requestEndpointMode)) break
      const finRunId = textField(data, 'run_id')
      const finStatus = textField(data, 'status', 'completed')
      const finReason = textField(data, 'reason')
      queueMessageUpdate(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                runId: m.runId || finRunId,
                remediationStatus: {
                  runId: finRunId || m.runId || '',
                  status: finStatus,
                  reason: finReason,
                  errorCode: typeof data.error_code === 'string' ? data.error_code : undefined,
                  finishedAt: now,
                },
              }
            : m
        )
      )
      break
    }
  }
  return result()
}
