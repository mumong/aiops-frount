import { useEffect, useRef, useCallback } from 'react'
import { ChatMessage, NodeBlock } from './types'
import UserMessage from './UserMessage'
import BotMessage from './BotMessage'
import styles from './MessageList.module.css'

interface MessageListProps {
  messages: ChatMessage[]
  nodeBlocks: NodeBlock[]
  finalAnswer: string
  streamActive: boolean
  activitySeq: number
  onRemediationRespond?: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<unknown>
}

export default function MessageList({
  messages,
  nodeBlocks,
  finalAnswer,
  streamActive,
  activitySeq,
  onRemediationRespond,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  // Track whether user is near the bottom
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const threshold = 80
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  // Smart auto-scroll: only if user is at the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, nodeBlocks, finalAnswer])

  return (
    <div className={styles.list} ref={listRef} onScroll={handleScroll}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🤖</div>
          <p className={styles.emptyText}>输入运维问题，开始诊断分析</p>
          <p className={styles.emptyHint}>例如：我的集群有什么问题？</p>
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
            />
          )
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
