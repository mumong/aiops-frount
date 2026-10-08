import type { ChatMessage, NodeBlock, SSEMessage, RemediationApproval, EndpointMode, ParallelEvidenceGroup } from './types'
import { parseRemediationApprovalText, toRemediationApproval } from './remediationParsing'
import { shouldProcessRemediation } from './chatRequestPolicy'
import { applyNodeThinkingEvent, finishNodeToolCall, startNodeBlock, startNodeToolCall, setNodeRuntimeStatus, settleNodeBlocks } from './nodeBlockUpdates'
import { presentToolEvent } from './toolPresentation'
import { presentRoute } from './routePresentation'
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
}

export interface ChatEventTransition extends ChatEventState {
  messageUpdates: Array<(messages: ChatMessage[]) => ChatMessage[]>
  finalAnswer?: string
  streaming?: boolean
}

function mirrorParallelEvidence(
  blocks: NodeBlock[],
  updater: (state: NonNullable<NodeBlock['parallelEvidence']>) => NonNullable<NodeBlock['parallelEvidence']>,
): NodeBlock[] {
  let mirrored = false
  const next = blocks.map(block => {
    if (block.nodeId !== 'parallel_evidence' || !block.parallelEvidence) return block
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
    messageUpdates,
    ...(finalAnswer !== undefined ? { finalAnswer } : {}),
    ...(streaming !== undefined ? { streaming } : {}),
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
    parseAndShowTextApproval(assistantId, nextContent, endpointMode)
  }

  if (msg.event === 'text') {
    appendTextStreamChunk(assistantId, msg.data, requestEndpointMode)
    return result()
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(msg.data)
  } catch {
    appendTextStreamChunk(assistantId, msg.data, requestEndpointMode)
    return result()
  }

  const eventType = msg.event === 'message' && typeof data.type === 'string'
    ? data.type
    : msg.event

  switch (eventType) {
    case 'run_start':
      queueMessageUpdate(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, runId: String(data.run_id || '') } : m
        )
      )
      break

    case 'node_start': {
      const nodeId = String(data.node || '')
      const nodeName = String(data.node_name || data.node || '')
      updateNodeBlocks(prev => {
        const started = startNodeBlock(prev, nodeId, nodeName)
        if (nodeId !== 'parallel_evidence' || parallelGroups.length < 2) {
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

    case 'thinking': {
      const thinkType = String(data.thinking_type || '')
      const nodeId = String(data.node || '')
      const nodeName = String(data.node_name || data.node || nodeId || '')

      if (thinkType === 'runtime_status') {
        const groupId = String(data.parallel_group_id || '')
        if (groupId) {
          updateNodeBlocks(prev => prev.map(block => !block.parallelEvidence ? block : {
            ...block, parallelEvidence: {...block.parallelEvidence,
              groups: block.parallelEvidence.groups.map(group => group.groupId !== groupId ? group : {
                ...group, runtimeStatus: String(data.content || ''),
              })},
          }))
        } else {
          updateNodeBlocks(prev => setNodeRuntimeStatus(prev, nodeId, nodeName,
            String(data.content || ''), String(data.status || 'running'), now))
        }
      } else if (thinkType === 'ai_token') {
        const content = String(data.content || '')
        updateNodeBlocks(prev => applyNodeThinkingEvent(prev, nodeId, nodeName, 'ai_token', content))
      } else if (thinkType === 'ai_message') {
        const content = String(data.full_content || data.content || '')
        updateNodeBlocks(prev => applyNodeThinkingEvent(prev, nodeId, nodeName, 'ai_message', content))
      } else if (thinkType === 'tool_start') {
        const toolName = String(data.tool_name || '')
        const backendCallId = String(data.tool_call_id || '').trim()
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
            && (nodeId === 'parallel_evidence' || nodeId === 'evidence')
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
      } else if (thinkType === 'tool_result') {
        const toolName = String(data.tool_name || '')
        const status = data.semantic_success === false ? 'error' : String(data.status || 'success')
        const presentation = presentToolEvent(data)
        const preview = presentation.preview
        const resultData = presentation.detail
        const parallelResultData = resolveParallelResultData(data)
        const toolCallId = String(data.tool_call_id || '').trim()
        const evidenceContext = parseParallelEvidenceStreamContext(data.evidence_context)
        const semanticSuccess = typeof data.semantic_success === 'boolean'
          ? data.semantic_success
          : undefined
        const rawRef = String(data.raw_ref || '').trim()
        const structuredRef = String(data.structured_ref || '').trim()
        const summaryRef = String(data.summary_ref || '').trim()
        updateNodeBlocks(prev => {
          const isGroupedEvidence = parallelGroups.length >= 2
            && (nodeId === 'parallel_evidence' || nodeId === 'evidence')
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

    case 'heartbeat':
      break

    case 'node_complete': {
      const nodeId = String(data.node || '')
      const duration = Number(data.duration_seconds || 0)
      const handoff = String(data.handoff_summary || '')
      if (nodeId === 'layer') {
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
            ...(nodeId === 'request_router'
              ? { routeDecision: presentRoute(data.state_snapshot) } : {}),
            ...(n.parallelEvidence
              ? { parallelEvidence: applyParallelOutcomes(completeParallelEvidence(n.parallelEvidence), data.state_snapshot) }
              : {}),
          }
        }
        if (
          nodeId === 'evidence'
          && parallelGroups.length >= 2
          && n.parallelEvidence
        ) {
          return { ...n, parallelEvidence: completeParallelEvidence(n.parallelEvidence) }
        }
        return n
      }))
      break
    }

    case 'final': {
      updateNodeBlocks(prev => settleNodeBlocks(prev, 'complete'))
      const answer = String(data.answer || '')
      setFinalAnswer(answer)
      textBuffer = answer
      // Take a snapshot of current nodeBlocks and store them on the message
      // so they survive when the next message is sent
      const snapshot = nodeBlocks
      queueMessageUpdate(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: answer, status: 'complete' as const,
                resultStatus: data.status === 'partial' ? 'partial' as const : data.status === 'error' ? 'error' as const : 'success' as const,
                nodeBlocks: snapshot }
            : m
        )
      )
      parseAndShowTextApproval(assistantId, answer, requestEndpointMode)
      break
    }

    case 'error': {
      updateNodeBlocks(prev => settleNodeBlocks(prev, 'stopped'))
      const errorMsg = String(data.error || '未知错误')
      setFinalAnswer(`❌ ${errorMsg}`)
      queueMessageUpdate(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, status: 'error' as const, content: `❌ ${errorMsg}` }
            : m
        )
      )
      setIsStreaming(false)
      break
    }

    case 'remediation_approval_required': {
      if (!shouldProcessRemediation(requestEndpointMode)) break
      const approval: RemediationApproval = {
        type: String(data.approval_kind || 'plan') as 'plan' | 'action',
        approvalId: String(data.approval_id || ''),
        runId: String(data.run_id || ''),
        title: String(data.title || '修复审批'),
        description: String(data.description || ''),
        payload: data.payload as Record<string, unknown> | undefined,
        requestedAt: now,
        expiresAt: typeof data.expires_at === 'number' && typeof data.server_time === 'number'
          ? now + Math.max(0, data.expires_at - data.server_time) * 1000 : undefined,
      }
      upsertRemediationApproval(assistantId, approval)
      break
    }

    case 'remediation_tool_start':
    case 'remediation_tool_result': {
      const result = {
        key: [data.run_id, data.group_id, data.action_id, data.stage].join(':'),
        groupId: String(data.group_id || ''), actionId: String(data.action_id || ''),
        stage: String(data.stage || ''), command: String(data.command || ''),
        status: String(data.status || ''), result: String(data.result_preview || ''),
        truncated: data.result_truncated === true,
      }
      queueMessageUpdate(prev => prev.map(m => m.id === assistantId ? {
        ...m, remediationResults: [...(m.remediationResults || []).filter(r => r.key !== result.key), result],
      } : m))
      break
    }

    case 'remediation_finished': {
      if (!shouldProcessRemediation(requestEndpointMode)) break
      const finRunId = String(data.run_id || '')
      const finStatus = String(data.status || 'completed')
      const finReason = String(data.reason || '')
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
