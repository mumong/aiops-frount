import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatSession, ChatMessage, NodeBlock, SSEMessage, EndpointMode, ParallelEvidenceGroup } from './types'
import { useSSE } from '../../hooks/useSSE'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import { buildChatRequestParams } from './chatRequestPolicy'
import { settleNodeBlocks } from './nodeBlockUpdates'
import { transitionChatEvent } from './chatEventTransition'
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

interface ChatSessionPanelProps {
  sessionId: string
  initialSession?: ChatSession
  initialDraft: string
  active: boolean
  apiBase: string
  title: string
  maxMessages: number
  onStart: (session: ChatSession) => void
  onFinish: (id: string) => void
  onSave: (id: string, messages: ChatMessage[], blocks: NodeBlock[], answer: string, mode: EndpointMode) => void
  onDraftChange: (id: string, text: string) => void
}

/** One mounted panel owns one conversation and one transport, even while hidden. */
export default function ChatSessionPanel({ sessionId, initialSession, initialDraft, active,
  apiBase, title, maxMessages, onStart, onFinish, onSave, onDraftChange }: ChatSessionPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialSession?.messages || [])
  const messagesRef = useRef(messages)
  const [isStreaming, setIsStreaming] = useState(false)
  const streamingRef = useRef(false)
  const [inputDraft, setInputDraft] = useState<{ text: string } | null>(null)
  const [nodeBlocks, setNodeBlocks] = useState<NodeBlock[]>(() => initialSession?.nodeBlocks || [])
  const nodeBlocksRef = useRef(nodeBlocks)
  const parallelGroupsRef = useRef<ParallelEvidenceGroup[]>([])
  const [finalAnswer, setFinalAnswer] = useState(() => initialSession?.finalAnswer || '')
  const finalAnswerRef = useRef(finalAnswer)
  const [sseActivitySeq, setSseActivitySeq] = useState(0)
  const toolIdCounter = useRef(0)
  const messageIdCounter = useRef(messages.reduce((max, message) => {
    const value = parseInt(message.id.replace('msg-', ''), 10)
    return value > max ? value : max
  }, 0))
  const textStreamBufferRef = useRef('')
  const requestSequence = useRef(0)
  const { connect, disconnect } = useSSE()

  useEffect(() => () => {
    requestSequence.current += 1
    disconnect()
  }, [disconnect])

  const updateMessages = useCallback((update: (value: ChatMessage[]) => ChatMessage[]) => {
    const next = update(messagesRef.current)
    messagesRef.current = next
    setMessages(next)
  }, [])
  const updateNodeBlocks = useCallback((update: (value: NodeBlock[]) => NodeBlock[]) => {
    const next = update(nodeBlocksRef.current)
    nodeBlocksRef.current = next
    setNodeBlocks(next)
  }, [])
  const updateAnswer = useCallback((answer: string) => {
    finalAnswerRef.current = answer
    setFinalAnswer(answer)
  }, [])
  const saveSnapshot = useCallback(() => {
    onSave(sessionId, messagesRef.current, nodeBlocksRef.current, finalAnswerRef.current, 'ask')
  }, [onSave, sessionId])
  const finishRun = useCallback((releasePanel = true) => {
    streamingRef.current = false
    setIsStreaming(false)
    // Save synchronously by owner before an inactive panel is allowed to unmount.
    saveSnapshot()
    if (releasePanel) onFinish(sessionId)
  }, [saveSnapshot, onFinish, sessionId])

  const handleSSEEvent = useCallback((msg: SSEMessage, assistantId: string, requestEndpointMode: EndpointMode) => {
    setSseActivitySeq(seq => seq + 1)
    const next = transitionChatEvent({
      nodeBlocks: nodeBlocksRef.current,
      parallelGroups: parallelGroupsRef.current,
      textBuffer: textStreamBufferRef.current,
      toolIdCounter: toolIdCounter.current,
    }, msg, assistantId, requestEndpointMode, Date.now())
    updateNodeBlocks(() => next.nodeBlocks)
    parallelGroupsRef.current = next.parallelGroups
    textStreamBufferRef.current = next.textBuffer
    toolIdCounter.current = next.toolIdCounter
    for (const update of next.messageUpdates) updateMessages(update)
    if (next.finalAnswer !== undefined) updateAnswer(next.finalAnswer)
    // A final report can precede approval events; retain the panel until transport closes.
    if (next.streaming === false) finishRun(false)
    else if (!streamingRef.current) saveSnapshot()
  }, [updateNodeBlocks, updateMessages, updateAnswer, finishRun, saveSnapshot])

  const sendMessage = useCallback((question: string) => {
    if (!question.trim() || streamingRef.current) return
    const requestId = ++requestSequence.current
    const newMsg: ChatMessage = { id: `msg-${++messageIdCounter.current}`,
      role: 'user', content: question, timestamp: Date.now() }
    const assistantMsg: ChatMessage = { id: `msg-${++messageIdCounter.current}`,
      role: 'assistant', content: '', timestamp: Date.now(), status: 'streaming' }
    updateMessages(previous => [...previous.slice(-maxMessages + 2), newMsg, assistantMsg])
    streamingRef.current = true
    setIsStreaming(true)
    updateNodeBlocks(() => [])
    parallelGroupsRef.current = []
    updateAnswer('')
    textStreamBufferRef.current = ''
    toolIdCounter.current = 0
    setSseActivitySeq(0)
    // The backend router chooses the workflow, including for legacy query sessions.
    const requestEndpointMode: EndpointMode = 'ask'
    const now = Date.now()
    const firstQuestion = messagesRef.current.find(message => message.role === 'user')?.content || question
    onStart({ id: sessionId, title: firstQuestion.slice(0, 40) + (firstQuestion.length > 40 ? '...' : ''),
      messages: messagesRef.current, nodeBlocks: [], finalAnswer: '', endpointMode: requestEndpointMode,
      createdAt: initialSession?.createdAt || now, updatedAt: now })
    const params = buildChatRequestParams(question, requestEndpointMode, sessionId)
    connect(`${apiBase}/${requestEndpointMode}`, { method: 'GET', body: params },
      msg => {
        if (requestId !== requestSequence.current) return
        handleSSEEvent(msg, assistantMsg.id, requestEndpointMode)
      },
      error => {
        if (requestId !== requestSequence.current) return
        updateNodeBlocks(previous => settleNodeBlocks(previous, 'stopped'))
        updateAnswer(`❌ 错误: ${error.message}`)
        updateMessages(previous => previous.map(message => message.id === assistantMsg.id
          ? { ...message, status: 'error', content: `❌ 错误: ${error.message}` } : message))
        finishRun()
      },
      () => {
        if (requestId !== requestSequence.current) return
        updateNodeBlocks(previous => settleNodeBlocks(previous, 'stopped'))
        finishRun()
      })
  }, [apiBase, sessionId, maxMessages, initialSession?.createdAt, onStart, connect,
    updateMessages, updateNodeBlocks, updateAnswer, handleSSEEvent, finishRun])

  const handleStop = useCallback(() => {
    requestSequence.current += 1
    disconnect()
    updateNodeBlocks(previous => settleNodeBlocks(previous, 'stopped'))
    updateMessages(previous => previous.map(message => message.status === 'streaming'
      ? { ...message, status: 'complete', nodeBlocks: nodeBlocksRef.current } : message))
    finishRun()
  }, [disconnect, updateNodeBlocks, updateMessages, finishRun])
  const handleRemediationRespond = useCallback((runId: string, approvalId: string, approved: boolean, reason?: string) => {
    return submitRemediationApproval(apiBase, runId, approvalId, approved, reason)
  }, [apiBase])
  const handleDraftChange = useCallback((text: string) => onDraftChange(sessionId, text), [sessionId, onDraftChange])

  return <div className={styles.main} hidden={!active} aria-label="会话面板">
    <ChatHeader title={title} isConnected={!isStreaming} />
    <MessageList messages={messages} nodeBlocks={nodeBlocks} finalAnswer={finalAnswer}
      streamActive={isStreaming} activitySeq={sseActivitySeq} onRemediationRespond={handleRemediationRespond}
      onRequestRepair={() => setInputDraft({ text: '请根据刚才的诊断，为其中异常 Pod 制定修复方案并提交人工审查；先核实当前状态并参考 Runbook。' })}
      onSuggestion={question => setInputDraft({ text: question })} />
    <MessageInput draft={inputDraft} initialText={initialDraft} onTextChange={handleDraftChange}
      onSend={sendMessage} onStop={handleStop} isStreaming={isStreaming}
      placeholder="描述你的运维问题，例如查询节点资源使用率或排查 Pod 异常" />
  </div>
}
