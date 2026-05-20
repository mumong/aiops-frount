import { useState, useCallback, useRef, useEffect } from 'react'
import { ChatMessage, NodeBlock, ToolCall, SSEMessage } from './types'
import { useSSE } from '../../hooks/useSSE'
import { useChatHistory } from '../../hooks/useChatHistory'
import ChatHeader from './ChatHeader'
import Sidebar from './Sidebar'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import styles from './ChatWidget.module.css'

export interface ChatWidgetProps {
  apiBase: string
  title?: string
  placeholder?: string
  maxMessages?: number
}

type EndpointMode = 'ask' | 'query'

function updateLast(blocks: NodeBlock[], fn: (b: NodeBlock) => NodeBlock): NodeBlock[] {
  if (blocks.length === 0) return blocks
  const copy = blocks.slice()
  copy[copy.length - 1] = fn(copy[copy.length - 1]!)
  return copy
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
  const toolIdCounter = useRef(0)
  const messageIdCounter = useRef(0)

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

  const handleSSEEvent = useCallback((msg: SSEMessage, assistantId: string) => {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(msg.data)
    } catch {
      return
    }

    switch (msg.event) {
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
        setNodeBlocks((prev) => {
          if (prev.some(n => n.nodeId === nodeId && n.status === 'running')) return prev
          return [...prev, {
            nodeId,
            nodeName,
            status: 'running',
            thinkingTokens: '',
            toolCalls: [],
          }]
        })
        break
      }

      case 'thinking': {
        const thinkType = String(data.thinking_type || '')

        // Defensive: if thinking event arrives before node_start, auto-create the node
        setNodeBlocks(prev => {
          if (prev.length === 0) {
            const node = String(data.node || '')
            const nodeName = String(data.node_name || data.node || node || '')
            if (!node && !nodeName) return prev
            return [{
              nodeId: node || nodeName,
              nodeName: nodeName || node,
              status: 'running' as const,
              thinkingTokens: '',
              toolCalls: [],
            }]
          }
          return prev
        })

        if (thinkType === 'ai_token') {
          const content = String(data.content || '')
          setNodeBlocks(prev =>
            updateLast(prev, last => ({
              ...last,
              thinkingTokens: last.thinkingTokens + content,
            }))
          )
        } else if (thinkType === 'ai_message') {
          const content = String(data.content || '')
          setNodeBlocks(prev =>
            updateLast(prev, last => ({
              ...last,
              thinkingTokens: last.thinkingTokens
                ? last.thinkingTokens + '\n' + content
                : content,
            }))
          )
        } else if (thinkType === 'tool_start') {
          const toolName = String(data.tool_name || '')
          setNodeBlocks(prev =>
            updateLast(prev, last => ({
              ...last,
              toolCalls: [...last.toolCalls, {
                id: `tool-${++toolIdCounter.current}`,
                toolName,
                status: 'running' as const,
              }],
            }))
          )
        } else if (thinkType === 'tool_result') {
          const toolName = String(data.tool_name || '')
          const status = String(data.status || 'success')
          const preview = String(data.result_preview || '')
          // Save full result data for click-to-expand
          const resultData = JSON.stringify(data, null, 2)
          setNodeBlocks(prev =>
            updateLast(prev, last => {
              // Only update the FIRST still-running tool call with this name,
              // otherwise duplicate tool calls in the same node all get the
              // same result (bug: map hits all matches at once).
              const idx = last.toolCalls.findIndex(
                (t: ToolCall) => t.toolName === toolName && t.status === 'running'
              )
              if (idx === -1) return last
              const updated: ToolCall[] = [...last.toolCalls]
              const old = updated[idx]!
              updated[idx] = {
                id: old.id,
                toolName: old.toolName,
                status: (status === 'success' ? 'success' : 'error') as 'success' | 'error',
                resultPreview: preview,
                resultData,
              }
              return { ...last, toolCalls: updated }
            })
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
    }
  }, [])

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
    toolIdCounter.current = 0

    const params = new URLSearchParams({
      q: question,
      format: 'sse',
      stream: 'true',
    })

    connect(
      `${apiBase}/${endpointMode}`,
      { method: 'GET', body: params },
      (msg: SSEMessage) => {
        handleSSEEvent(msg, assistantMsg.id)
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
