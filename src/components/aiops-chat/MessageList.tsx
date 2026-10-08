import { useEffect, useRef, useCallback, useState } from 'react'
import { ChatMessage, NodeBlock, type EndpointMode } from './types'
import { Box, ArrowUpRight, Activity, Search, ShieldCheck } from 'lucide-react'
import UserMessage from './UserMessage'
import BotMessage from './BotMessage'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: ChatMessage[]
  nodeBlocks: NodeBlock[]
  finalAnswer: string
  streamActive: boolean
  activitySeq: number
  onRequestRepair?: () => void
  onSuggestion?: (question: string, mode: EndpointMode) => void
  onRemediationRespond?: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<unknown>
}

export default function MessageList({
  messages,
  nodeBlocks,
  finalAnswer,
  streamActive,
  activitySeq,
  onRemediationRespond,
  onRequestRepair,
  onSuggestion,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showLatest, setShowLatest] = useState(false)
  const latestMessageId = messages[messages.length - 1]?.id
  useEffect(() => { isNearBottomRef.current = true }, [latestMessageId])

  // Track whether user is near the bottom
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const threshold = 80
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    setShowLatest(!isNearBottomRef.current)
  }, [])

  // Smart auto-scroll: only if user is at the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      // Avoid queuing smooth animations for every streaming token.
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    }
  }, [messages, nodeBlocks, finalAnswer])

  return (
    <div className={styles.list} ref={listRef} onScroll={handleScroll} aria-label="对话内容" tabIndex={0}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Box size={29} strokeWidth={1.5} /></div>
          <div className={styles.eyebrow}>KUBERNETES · AIOPS COPILOT</div>
          <h2 className={styles.emptyText}>智能运维助手</h2>
          <p className={styles.emptyHint}>查询集群资源使用情况，排查 Pod 异常。</p>
          <p className={styles.emptyDescription}>基于 Prometheus 查询 CPU、内存等指标；结合 Pod 日志与 Kubernetes 资源信息分析可能的根因。<br />深度诊断聚焦 Pod 异常，如 ImagePullBackOff、Pending、Terminating 等。</p>
          <div className={styles.suggestions}>
            <button type="button" className={`${styles.suggestion} ${styles.suggestionPrimary}`} onClick={() => onSuggestion?.('查询我集群的 CPU 和内存使用率？', 'query')}>
              <Search size={22} /><span><strong>简单查询 <small className={styles.commonBadge}>常用</small></strong><span>查询我集群的 CPU 和内存使用率？</span></span><ArrowUpRight size={17} />
            </button>
            <button type="button" className={styles.suggestion} onClick={() => onSuggestion?.('我的集群有什么问题？', 'ask')}>
              <Activity size={18} /><span><strong>深度诊断</strong><span>我的集群有什么问题？</span></span><ArrowUpRight size={15} />
            </button>
          </div>
          <div className={styles.emptyNote}><ShieldCheck size={14} />修复方案由你审阅，执行前需要人工审批</div>
        </div>
      )}
      {messages.map((msg, idx) => (
        msg.role === 'user'
          ? <UserMessage key={msg.id} content={msg.content} />
          : (
            <BotMessage
              key={msg.id}
              message={msg}
              nodeBlocks={
                idx === messages.length - 1
                  ? nodeBlocks
                  : msg.nodeBlocks ?? []
              }
              finalAnswer={
                idx === messages.length - 1
                  ? finalAnswer
                  : msg.content
              }
              isLatest={idx === messages.length - 1}
              streamActive={streamActive}
              activitySeq={activitySeq}
              onRemediationRespond={onRemediationRespond}
              onRequestRepair={onRequestRepair}
            />
          )
      ))}
      <div ref={bottomRef} />
      {showLatest && <button className={styles.jumpLatest} type="button" onClick={() => {
        isNearBottomRef.current = true
        setShowLatest(false)
        bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
      }}>↓ 回到最新内容</button>}
    </div>
  )
}
