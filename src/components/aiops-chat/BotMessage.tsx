import { useState } from 'react'
import { ChatMessage, NodeBlock, NODE_LABELS } from './types'
import MarkdownReport from './MarkdownReport'
import RemediationApprovalCard from './RemediationApprovalCard'
import { getRemediationStatusPresentation } from './remediationStatusPresentation'
import ParallelEvidenceBoard from './ParallelEvidenceBoard'
import styles from './MessageList.module.css'

interface BotMessageProps {
  message: ChatMessage
  nodeBlocks: NodeBlock[]
  finalAnswer: string
  isLatest: boolean
  streamActive: boolean
  activitySeq: number
  onRemediationRespond?: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<unknown>
}

export default function BotMessage({
  message,
  nodeBlocks,
  finalAnswer,
  isLatest,
  streamActive,
  activitySeq,
  onRemediationRespond,
}: BotMessageProps) {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'

  return (
    <div className={styles.botRow}>
      <span className={styles.botAvatar}>🤖</span>
      <div className={styles.botContent}>
        {/* Error block */}
        {isError ? (
          <div className={`${styles.botBubble} ${styles.errorBubble}`}>
            <div>{message.content}</div>
          </div>
        ) : (
          <>
            {/* Run ID */}
            {message.runId && (
              <div className={styles.runIdTag}>
                🏷 run_id: <code>{message.runId}</code>
              </div>
            )}
            {/* Node blocks — collapsible sections */}
            {nodeBlocks.length > 0 && (
              <div className={styles.nodeBlocksArea}>
                {nodeBlocks.map((nb, idx) => (
                  <NodeBlockCard
                    key={nb.nodeId || idx}
                    block={nb}
                    isLast={idx === nodeBlocks.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Streaming indicator when waiting but no content yet */}
            {isStreaming && isLatest && nodeBlocks.length === 0 && (
              <div className={styles.botBubble}>
                <div className={styles.streamingContent}>⏳ 等待响应...</div>
              </div>
            )}

            {/* Final markdown report */}
            {finalAnswer && message.status === 'complete' ? (
              <div className={styles.botBubble}>
                <MarkdownReport content={finalAnswer} />
              </div>
            ) : finalAnswer && isStreaming ? (
              <div className={styles.botBubble}>
                <div className={styles.streamingContent}>{finalAnswer}</div>
              </div>
            ) : null}

            {/* Remediation approval cards */}
            {message.remediationApprovals && message.remediationApprovals.length > 0 && (
              <div className={styles.remediationArea}>
                {message.remediationApprovals.map((ra, idx) => (
                  <RemediationApprovalCard
                    key={ra.approvalId || idx}
                    approval={ra}
                    isCurrent={idx === message.remediationApprovals!.length - 1 && isLatest}
                    streamActive={streamActive}
                    activitySeq={activitySeq}
                    onRespond={(approvalId, approved, reason) => {
                      const runId = ra.runId || message.runId
                      if (onRemediationRespond && runId) {
                        return onRemediationRespond(runId, approvalId, approved, reason)
                      }
                      return Promise.reject(new Error('runId或审批回调未就绪'))
                    }}
                  />
                ))}
              </div>
            )}

            {/* Remediation finished status */}
            {message.remediationStatus && <RemediationStatusCard status={message.remediationStatus} />}
          </>
        )}
      </div>
    </div>
  )
}

function RemediationStatusCard({ status }: { status: NonNullable<ChatMessage['remediationStatus']> }) {
  const presentation = getRemediationStatusPresentation(status)
  const toneClass =
    presentation.tone === 'failed'
      ? styles.remediationCardFailed
      : presentation.tone === 'blocked'
        ? styles.remediationCardBlocked
        : presentation.tone === 'success'
          ? styles.remediationCardSuccess
          : styles.remediationCardNeutral

  return (
    <div className={`${styles.remediationCard} ${toneClass}`}>
      <div className={styles.remediationHeader}>
        <span className={styles.remediationIcon}>{presentation.icon}</span>
        <span className={styles.remediationLabel}>{presentation.label}</span>
      </div>
      {presentation.detail && (
        <div className={styles.remediationBody}>
          <div className={styles.remediationDesc}>
            {presentation.detail}
          </div>
        </div>
      )}
    </div>
  )
}

/** Collapsible card for a single workflow node */
function NodeBlockCard({ block, isLast }: { block: NodeBlock; isLast: boolean }) {
  const [expanded, setExpanded] = useState(block.nodeId === 'parallel_evidence')
  const label = NODE_LABELS[block.nodeId] || block.nodeName
  const isRunning = block.status === 'running'
  const isComplete = block.status === 'complete'
  const hasContent = !!(block.parallelEvidence || block.thinkingTokens || block.toolCalls.length > 0)

  return (
    <div className={`${styles.nodeBlock} ${isRunning && isLast ? styles.nodeBlockActive : ''} ${isComplete ? styles.nodeBlockDone : ''}`}>
      {/* Node header - always clickable */}
      <div
        className={styles.nodeHeader}
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <span className={`${styles.nodeStatus} ${isRunning ? styles.nodeRunning : styles.nodeComplete}`}>
          {isRunning ? '⏳' : '✅'}
        </span>
        <span className={styles.nodeLabel}>{label}</span>
        {isRunning && isLast && <span className={styles.nodePulse}>执行中...</span>}
        {isComplete && block.durationSeconds != null && (
          <span className={styles.nodeDuration}>{formatDuration(block.durationSeconds)}</span>
        )}
        <span className={styles.nodeToggle}>{expanded ? '▾' : '▸'}</span>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className={styles.nodeBody}>
          {!hasContent && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}>⏳ 等待工具响应...</div>
            </div>
          )}
          {block.parallelEvidence && (
            <div className={styles.nodeSection}>
              <ParallelEvidenceBoard state={block.parallelEvidence} />
            </div>
          )}
          {/* Thinking tokens */}
          {block.thinkingTokens && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}>💭 AI 推理过程</div>
              <pre className={styles.nodeThinking}>{block.thinkingTokens}</pre>
            </div>
          )}

          {/* Tool calls */}
          {block.toolCalls.length > 0 && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}>🔧 工具调用 ({block.toolCalls.length})</div>
              <div className={styles.toolCalls}>
                {block.toolCalls.map(tc => (
                  <ToolCallItem key={tc.id} tc={tc} />
                ))}
              </div>
            </div>
          )}

          {/* Handoff summary */}
          {block.handoffSummary && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}>📤 输出</div>
              <HandoffDisplay text={block.handoffSummary} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toFixed(0)}s`
}

// ── Handoff text parser & display ──

interface HandoffKV {
  key: string
  value: string
  isJson: boolean
}

/** Parse "key1=v1 key2={"json":"data"} key3=text" into structured KV pairs */
function parseHandoff(text: string): HandoffKV[] {
  const pairs: HandoffKV[] = []
  let i = 0

  while (i < text.length) {
    while (i < text.length && text[i] === ' ') i++
    if (i >= text.length) break

    const eqIdx = text.indexOf('=', i)
    if (eqIdx === -1) break

    const key = text.slice(i, eqIdx).trim()
    if (!key) { i = eqIdx + 1; continue }

    i = eqIdx + 1

    // JSON object/array?
    if (i < text.length && (text[i] === '{' || text[i] === '[')) {
      const open = text[i]
      const close = open === '{' ? '}' : ']'
      let depth = 0
      let inStr = false
      let esc = false
      const start = i
      while (i < text.length) {
        const ch = text[i]
        if (inStr) {
          if (esc) { esc = false }
          else if (ch === '\\') { esc = true }
          else if (ch === '"') { inStr = false }
        } else {
          if (ch === '"') { inStr = true }
          else if (ch === open) { depth++ }
          else if (ch === close) { depth--; if (depth === 0) { i++; break } }
        }
        i++
      }
      const rawJson = text.slice(start, i)
      const formatted = tryFormatJson(rawJson)
      pairs.push({ key, value: formatted, isJson: true })
    } else {
      const start = i
      while (i < text.length) {
        if (text[i] === ' ') {
          const peek = text.slice(i).match(/^\s+\w+=/)
          if (peek) break
        }
        i++
      }
      let value = text.slice(start, i).trim()
      value = value.replace(/[\x00-\x1f]+/g, ' ').trim()
      if (value) {
        pairs.push({ key, value, isJson: false })
      }
    }
  }

  return pairs
}

function tryFormatJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

function HandoffDisplay({ text }: { text: string }) {
  const pairs = parseHandoff(text)
  if (pairs.length === 0) {
    return <div className={styles.nodeHandoff}>{text}</div>
  }

  return (
    <div className={styles.handoffKvList}>
      {pairs.map((p, i) => (
        <HandoffKVItem key={i} kv={p} />
      ))}
    </div>
  )
}

function HandoffKVItem({ kv }: { kv: HandoffKV }) {
  const [expanded, setExpanded] = useState(false)
  const shortValue = kv.value.length > 120 ? kv.value.slice(0, 120) + '…' : kv.value

  return (
    <div className={styles.handoffKvItem}>
      <span className={styles.handoffKey}>{kv.key}</span>
      {kv.isJson ? (
        <div>
          <pre
            className={`${styles.handoffValue} ${styles.handoffValuePre} ${expanded ? '' : styles.handoffValueCollapsed}`}
            onClick={() => setExpanded(!expanded)}
          >
            <code>{expanded ? kv.value : shortValue}</code>
          </pre>
          {kv.value.length > 120 && (
            <span
              className={styles.handoffExpand}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起 ▲' : '展开 ▼'}
            </span>
          )}
        </div>
      ) : (
        <span className={styles.handoffValue}>{shortValue}</span>
      )}
    </div>
  )
}

/** Individual tool call item — clickable to show full result data */
function ToolCallItem({ tc }: { tc: import('./types').ToolCall }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const hasDetail = tc.status !== 'running' && tc.resultData

  return (
    <div>
      <div
        className={`${styles.toolCall} ${hasDetail ? styles.toolCallClickable : ''}`}
        onClick={() => hasDetail && setDetailOpen(!detailOpen)}
      >
        <span className={
          tc.status === 'running' ? styles.toolCallRunning
          : tc.status === 'success' ? styles.toolCallSuccess
          : styles.toolCallError
        }>
          {tc.status === 'running' ? '⏳' : tc.status === 'success' ? '✅' : '❌'}
        </span>
        <code className={styles.toolCallName}>{tc.toolName}</code>
        {tc.resultPreview && (
          <span className={styles.toolCallPreview}>
            — {tc.resultPreview.slice(0, 120)}
          </span>
        )}
        {hasDetail && (
          <span className={styles.toolDetailToggle}>{detailOpen ? '▾' : '▸'}</span>
        )}
      </div>
      {detailOpen && hasDetail && (
        <pre className={styles.toolDetailBody}>
          <code>{tc.resultData}</code>
        </pre>
      )}
    </div>
  )
}
