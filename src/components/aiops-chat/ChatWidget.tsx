import { useState, useCallback, useRef, useEffect } from 'react'
import { ChatMessage, NodeBlock, SSEMessage, RemediationApproval, EndpointMode } from './types'
import { useSSE } from '../../hooks/useSSE'
import { useChatHistory } from '../../hooks/useChatHistory'
import ChatHeader from './ChatHeader'
import Sidebar from './Sidebar'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import { parseRemediationApprovalText, toRemediationApproval } from './remediationParsing'
import { buildChatRequestParams, shouldProcessRemediation } from './chatRequestPolicy'
import { appendNodeThinking, finishNodeToolCall, startNodeBlock, startNodeToolCall } from './nodeBlockUpdates'
import styles from './ChatWidget.module.css'

/**
 * POST to the remediation approval endpoint.
 * Returns the parsed JSON response.
 */
async function submitRemediationApproval(
  apiBase: string,
  runId: string,
  approvalId: string,
  approved: boolean,
  reason?: string,
): Promise<{ success: boolean }> {
  const body = new URLSearchParams({
    run_id: runId,
    approval_id: approvalId,
    approved: String(approved),
    reviewer: 'operator',
  })
  if (reason) {
    body.set('reason', reason)
  }
  const res = await fetch(`${apiBase}/remediation/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`审批请求失败 (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  if (json.success !== true) {
    throw new Error(json.error || '审批请求被拒绝')
  }
  return json
}

export interface ChatWidgetProps {
  apiBase: string
  title?: string
  placeholder?: string
  maxMessages?: number
}

export default function ChatWidget({
  apiBase,
  title = 'k8s aiops',
  placeholder: _placeholder = '输入你的运维问题...',
  maxMessages = 50,
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [endpointMode, setEndpointMode] = useState<EndpointMode>('ask')
  const [nodeBlocks, setNodeBlocks] = useState<NodeBlock[]>([])
  const nodeBlocksRef = useRef<NodeBlock[]>([])
  const [finalAnswer, setFinalAnswer] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sseActivitySeq, setSseActivitySeq] = useState(0)
  const toolIdCounter = useRef(0)
  const messageIdCounter = useRef(0)
  const textStreamBufferRef = useRef('')

  const { connect, disconnect } = useSSE()
  const history = useChatHistory()

  // Keep nodeBlocksRef in sync with nodeBlocks state
  useEffect(() => {
    nodeBlocksRef.current = nodeBlocks
  }, [nodeBlocks])

  // Dynamic placeholder based on endpoint mode
  const effectivePlaceholder =
    endpointMode === 'ask'
      ? '我的集群pod有什么异常？'
      : '查询集群CPU和内存使用率'

  // Load session when activeId changes
  useEffect(() => {
    const session = history.getActiveSession()
    if (session) {
      setMessages(session.messages)
      setNodeBlocks(session.nodeBlocks)
      setFinalAnswer(session.finalAnswer)
      setEndpointMode(session.endpointMode)
      // Reset counters to max existing IDs
      const maxMsg = session.messages.reduce((max, m) => {
        const n = parseInt(m.id.replace('msg-', ''), 10)
        return n > max ? n : max
      }, 0)
      messageIdCounter.current = maxMsg
    }
  }, [history.activeId, history.getActiveSession])

  // Auto-save after streaming completes
  const prevIsStreaming = useRef(false)
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming && messages.length > 0) {
      history.saveCurrentSession(messages, nodeBlocks, finalAnswer, endpointMode)
    }
    prevIsStreaming.current = isStreaming
  }, [isStreaming, messages, nodeBlocks, finalAnswer, endpointMode, history])

  const upsertRemediationApproval = useCallback((assistantId: string, approval: RemediationApproval) => {
    setMessages(prev =>
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
  }, [])

  const parseAndShowTextApproval = useCallback((assistantId: string, text: string, endpointMode: EndpointMode) => {
    if (!shouldProcessRemediation(endpointMode)) return
    const parsed = parseRemediationApprovalText(text)
    if (!parsed) return
    upsertRemediationApproval(assistantId, toRemediationApproval(parsed))
  }, [upsertRemediationApproval])

  const appendTextStreamChunk = useCallback((assistantId: string, chunk: string, endpointMode: EndpointMode) => {
    textStreamBufferRef.current += chunk
    const nextContent = textStreamBufferRef.current
    setFinalAnswer(nextContent)
    setMessages(prev =>
      prev.map(m =>
        m.id === assistantId
          ? { ...m, content: nextContent }
          : m
      )
    )
    parseAndShowTextApproval(assistantId, nextContent, endpointMode)
  }, [parseAndShowTextApproval])

  const handleSSEEvent = useCallback((msg: SSEMessage, assistantId: string, requestEndpointMode: EndpointMode) => {
    setSseActivitySeq(seq => seq + 1)

    if (msg.event === 'text') {
      appendTextStreamChunk(assistantId, msg.data, requestEndpointMode)
      return
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(msg.data)
    } catch {
      appendTextStreamChunk(assistantId, msg.data, requestEndpointMode)
      return
    }

    const eventType = msg.event === 'message' && typeof data.type === 'string'
      ? data.type
      : msg.event

    switch (eventType) {
      case 'run_start':
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, runId: String(data.run_id || '') } : m
          )
        )
        break

      case 'node_start': {
        const nodeId = String(data.node || '')
        const nodeName = String(data.node_name || data.node || '')
        setNodeBlocks(prev => startNodeBlock(prev, nodeId, nodeName))
        break
      }

      case 'thinking': {
        const thinkType = String(data.thinking_type || '')
        const nodeId = String(data.node || '')
        const nodeName = String(data.node_name || data.node || nodeId || '')

        if (thinkType === 'ai_token') {
          const content = String(data.content || '')
          setNodeBlocks(prev => appendNodeThinking(prev, nodeId, nodeName, content))
        } else if (thinkType === 'ai_message') {
          const content = String(data.content || '')
          setNodeBlocks(prev => appendNodeThinking(prev, nodeId, nodeName, content, '\n'))
        } else if (thinkType === 'tool_start') {
          const toolName = String(data.tool_name || '')
          setNodeBlocks(prev =>
            startNodeToolCall(
              prev,
              nodeId,
              nodeName,
              {
                id: `tool-${++toolIdCounter.current}`,
                toolName,
                status: 'running' as const,
              },
            )
          )
        } else if (thinkType === 'tool_result') {
          const toolName = String(data.tool_name || '')
          const status = String(data.status || 'success')
          const preview = String(data.result_preview || '')
          const resultData = JSON.stringify(data, null, 2)
          setNodeBlocks(prev =>
            finishNodeToolCall(prev, nodeId, nodeName, toolName, status, preview, resultData)
          )
        }
        break
      }

      case 'heartbeat':
        break

      case 'node_complete': {
        const nodeId = String(data.node || '')
        const duration = Number(data.duration_seconds || 0)
        const handoff = String(data.handoff_summary || '')
        setNodeBlocks(prev =>
          prev.map(n =>
            n.nodeId === nodeId
              ? { ...n, status: 'complete' as const, durationSeconds: duration, handoffSummary: handoff || n.handoffSummary }
              : n
          )
        )
        break
      }

      case 'final': {
        const answer = String(data.answer || '')
        setFinalAnswer(answer)
        textStreamBufferRef.current = answer
        // Take a snapshot of current nodeBlocks and store them on the message
        // so they survive when the next message is sent
        const snapshot = nodeBlocksRef.current
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: answer, status: 'complete' as const, nodeBlocks: snapshot }
              : m
          )
        )
        parseAndShowTextApproval(assistantId, answer, requestEndpointMode)
        break
      }

      case 'error': {
        const errorMsg = String(data.error || '未知错误')
        setFinalAnswer(`❌ ${errorMsg}`)
        setMessages(prev =>
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
          requestedAt: Date.now(),
        }
        upsertRemediationApproval(assistantId, approval)
        break
      }

      case 'remediation_finished': {
        if (!shouldProcessRemediation(requestEndpointMode)) break
        const finRunId = String(data.run_id || '')
        const finStatus = String(data.status || 'completed')
        const finReason = String(data.reason || '')
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  runId: m.runId || finRunId,
                  remediationStatus: {
                    runId: finRunId || m.runId || '',
                    status: finStatus,
                    reason: finReason,
                    finishedAt: Date.now(),
                  },
                }
              : m
          )
        )
        break
      }
    }
  }, [appendTextStreamChunk, parseAndShowTextApproval, upsertRemediationApproval])

  const sendMessage = useCallback((question: string) => {
    if (!question.trim() || isStreaming) return

    const newMsg: ChatMessage = {
      id: `msg-${++messageIdCounter.current}`,
      role: 'user',
      content: question,
      timestamp: Date.now(),
    }

    const assistantMsg: ChatMessage = {
      id: `msg-${++messageIdCounter.current}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    }

    setMessages(prev => [...prev.slice(-maxMessages + 2), newMsg, assistantMsg])
    setIsStreaming(true)
    setNodeBlocks([])
    nodeBlocksRef.current = []
    setFinalAnswer('')
    textStreamBufferRef.current = ''
    toolIdCounter.current = 0
    setSseActivitySeq(0)

    const requestEndpointMode = endpointMode
    const params = buildChatRequestParams(question, requestEndpointMode)

    connect(
      `${apiBase}/${requestEndpointMode}`,
      { method: 'GET', body: params },
      (msg: SSEMessage) => {
        handleSSEEvent(msg, assistantMsg.id, requestEndpointMode)
      },
      (err: Error) => {
        setFinalAnswer(`❌ 错误: ${err.message}`)
        setIsStreaming(false)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, status: 'error', content: `❌ 错误: ${err.message}` }
              : m
          )
        )
      },
      () => {
        setIsStreaming(false)
      }
    )
  }, [apiBase, endpointMode, isStreaming, connect, maxMessages, handleSSEEvent])

  const handleRemediationRespond = useCallback(async (
    runId: string,
    approvalId: string,
    approved: boolean,
    reason?: string,
  ) => {
    return submitRemediationApproval(apiBase, runId, approvalId, approved, reason)
  }, [apiBase])

  const handleStop = useCallback(() => {
    disconnect()
    setIsStreaming(false)
    setMessages(prev =>
      prev.map(m =>
        m.status === 'streaming' ? { ...m, status: 'complete' as const } : m
      )
    )
  }, [disconnect])

  const handleNewSession = useCallback(() => {
    if (isStreaming) {
      disconnect()
      setIsStreaming(false)
    }
    setMessages([])
    setNodeBlocks([])
    setFinalAnswer('')
    history.newSession()
  }, [isStreaming, disconnect, history])

  const handleLoadSession = useCallback((id: string) => {
    if (isStreaming) return
    history.loadSession(id)
  }, [isStreaming, history])

  return (
    <div className={styles.widget}>
      <div className={styles.body}>
        <Sidebar
          sessions={history.sessions}
          activeId={history.activeId}
          onSelect={handleLoadSession}
          onDelete={history.deleteSession}
          onNew={handleNewSession}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(o => !o)}
        />
        <div className={styles.main}>
          <ChatHeader
            title={title}
            isConnected={!isStreaming}
            endpointMode={endpointMode}
            onEndpointChange={setEndpointMode}
          />
          <MessageList
            messages={messages}
            nodeBlocks={nodeBlocks}
            finalAnswer={finalAnswer}
            streamActive={isStreaming}
            activitySeq={sseActivitySeq}
            onRemediationRespond={handleRemediationRespond}
          />
          <MessageInput
            onSend={sendMessage}
            onStop={handleStop}
            isStreaming={isStreaming}
            placeholder={effectivePlaceholder}
            endpointMode={endpointMode}
          />
        </div>
      </div>
    </div>
  )
}
