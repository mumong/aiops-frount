import { useState, useEffect, useRef } from 'react'
import { ChatMessage, NodeBlock, NODE_LABELS } from './types'
import MarkdownReport from './MarkdownReport'
import RemediationApprovalCard from './RemediationApprovalCard'
import { getRemediationStatusPresentation } from './remediationStatusPresentation'
import ParallelEvidenceBoard from './ParallelEvidenceBoard'
import RouteCard from './RouteCard'
import { isLegacyHandoff, emptyNodeMessage, visibleNarrative, queryNarrative } from './handoffPresentation'
import styles from './MessageList.module.css'

interface BotMessageProps {
  message: ChatMessage
  nodeBlocks: NodeBlock[]
  finalAnswer: string
  isLatest: boolean
  streamActive: boolean
  activitySeq: number
  onRequestRepair?: () => void
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
  onRequestRepair,
}: BotMessageProps) {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const displayedAnswer = visibleNarrative(finalAnswer)

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
            <RouteCard blocks={nodeBlocks} terminal={!isStreaming} />
            {isStreaming && isLatest && <RunProgress blocks={nodeBlocks} />}
            {message.resultStatus === 'partial' && (
              <div role="status">⚠️ 本次仅部分完成；已取得的结果保留，未完成项见报告说明。</div>
            )}
            {nodeBlocks.length > 0 && (
              <div className={styles.nodeBlocksArea}>
                {nodeBlocks.filter(nb => !nb.routeDecision).map((nb, idx, visible) => (
                  <NodeBlockCard
                    key={nb.nodeId || idx}
                    block={nb}
                    isLast={idx === visible.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Streaming indicator when waiting but no content yet */}

            {/* Final markdown report */}
            {displayedAnswer && message.status === 'complete' ? (
              <div className={styles.botBubble}>
                <MarkdownReport content={displayedAnswer} />
              </div>
            ) : displayedAnswer && isStreaming ? (
              <div className={styles.botBubble}>
                <MarkdownReport content={displayedAnswer} />
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
            {message.remediationResults?.map(result => (
              <details key={result.key} className={`${styles.remediationCard} ${styles.repairResult}`} open>
                <summary>{result.groupId || '修复'} · {result.actionId} · {{ dry_run: '预演', execute: '执行', verify: '验证' }[result.stage] || result.stage} · {{ success: '命令成功', running: '正在执行', failed: '执行失败' }[result.status] || result.status}</summary>
                <pre className={styles.repairCode}>{result.command}</pre>
                <pre className={styles.repairOutput}>{result.result || (result.status === 'running' ? '已提交后端执行，正在等待命令返回。' : '命令未返回正文；请结合验证结果判断。')}</pre>
                {result.truncated && <div>返回内容较长，此处仅展示部分结果。</div>}
              </details>
            ))}
            {message.remediationStatus && <RemediationStatusCard status={message.remediationStatus} />}
            {isLatest && !streamActive && message.status === 'complete' && displayedAnswer
              && nodeBlocks.some(block => block.routeDecision?.route === 'full_diagnosis')
              && !message.remediationApprovals?.length && !message.remediationResults?.length
              && onRequestRepair && (
                <div className={styles.repairEntry}>
                  <div><strong>下一步 · 修复评估</strong>
                    <p>仅针对证据充分、具备明确操作的故障生成方案。先审阅命令，再决定是否执行。</p></div>
                  <button className={styles.repairPrimary} type="button" onClick={onRequestRepair}>生成修复方案并审阅</button>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

function RunProgress({ blocks }: { blocks: NodeBlock[] }) {
  const [now, setNow] = useState(() => Date.now())
  const started = useRef(now)
  const updated = useRef(now)
  // Heartbeats are not model progress. Only visible content/stage changes reset idle time.
  const signature = blocks.map(block => [block.nodeId, block.status, block.thinkingTokens,
    block.runtimeStatus?.text, block.handoffSummary,
    ...block.toolCalls.map(tool => `${tool.id}:${tool.status}`)].join('|')).join('\n')
  useEffect(() => { updated.current = Date.now() }, [signature])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const active = blocks.filter(block => block.status === 'running')
  const pending = active.reduce((count, block) => count + block.toolCalls.filter(tool => tool.status === 'running').length, 0)
  const runtime = active.find(block => block.runtimeStatus)?.runtimeStatus
  const idle = Math.max(0, Math.floor((now - updated.current) / 1000))
  const elapsed = Math.max(0, Math.floor((now - started.current) / 1000))
  const phase = runtime?.text || (pending ? `正在等待 ${pending} 个工具返回`
    : active.some(block => block.nodeId === 'request_router') ? '正在理解任务，等待模型返回路由'
      : active.length ? '正在等待模型返回分析或下一步工具调用' : '请求已提交，正在等待后端事件')
  return <div className={styles.runProgress} aria-label="运行状态">
    <div role="status" aria-live="polite"><span className={styles.progressDot} />{phase}</div>
    <div className={styles.progressMeta}>已用 {elapsed} 秒 · 距上次进展 {idle} 秒</div>
    {idle >= 30 && <div className={styles.progressWarning} role="status">
      暂无新进展，可能正在等待模型或服务响应；不表示操作已成功。可使用下方停止按钮结束等待，写操作中断后需核实是否生效。
    </div>}
    {!blocks.some(block => block.thinkingTokens) && <div className={styles.progressMeta}>尚未收到可展示的分析说明；收到后会自动显示。</div>}
  </div>
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
  const [expanded, setExpanded] = useState(true)
  const label = NODE_LABELS[block.nodeId] || block.nodeName
  const isRunning = block.status === 'running'
  const showBody = expanded
  const isComplete = block.status === 'complete'
  const thinking = block.nodeId === 'query_collect'
    ? queryNarrative(block.thinkingTokens || '') : visibleNarrative(block.thinkingTokens || '')
  const handoff = visibleNarrative(block.handoffSummary || '')
  const hasContent = !!(block.parallelEvidence || thinking || handoff || block.toolCalls.length > 0)
  const pending = block.toolCalls.filter(tool => tool.status === 'running').length
  const phase = block.runtimeStatus?.text || (pending
    ? `正在等待 ${pending} 个工具返回` : '等待模型返回分析或下一步工具调用')
  const [waitSeconds, setWaitSeconds] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    const started = Date.now()
    const timer = window.setInterval(() => setWaitSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [isRunning])

  return (
    <div className={`${styles.nodeBlock} ${isRunning && isLast ? styles.nodeBlockActive : ''} ${isComplete ? styles.nodeBlockDone : ''}`}>
      {/* Node header - always clickable */}
      <button
        type="button"
        aria-expanded={showBody}
        className={styles.nodeHeader}
        onClick={() => setExpanded(!showBody)}
        style={{ cursor: 'pointer' }}
      >
        <span className={`${styles.nodeStatus} ${isRunning ? styles.nodeRunning : styles.nodeComplete}`}>
          {isRunning ? '⏳' : isComplete ? '✅' : '⏹'}
        </span>
        <span className={styles.nodeLabel}>{label}</span>
        {block.toolCalls.length > 0 && <span className={styles.nodeDuration}>工具 {block.toolCalls.length}</span>}
        {isRunning && isLast && <span className={styles.nodePulse}>执行中...</span>}
        {isComplete && block.durationSeconds != null && (
          <span className={styles.nodeDuration}>{formatDuration(block.durationSeconds)}</span>
        )}
        <span className={styles.nodeToggle}>{showBody ? '▾' : '▸'}</span>
      </button>

      {isRunning && <div className={styles.nodeSection} role="status" aria-live="polite">
        {phase}（本阶段已用 {waitSeconds} 秒）
        {waitSeconds >= 15 && '。暂未收到下一阶段结果，不代表工具失败。'}
      </div>}

      {/* Expandable body */}
      {showBody && (
        <div className={styles.nodeBody}>
          {!hasContent && isRunning && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}>{emptyNodeMessage(isRunning)}</div>
            </div>
          )}
          {block.parallelEvidence && (
            <div className={styles.nodeSection}>
              <ParallelEvidenceBoard state={block.parallelEvidence} />
            </div>
          )}
          {/* Thinking tokens */}
          {thinking && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}>💭 分析过程 · 实时更新</div>
              <div className={styles.nodeAnalysis}><MarkdownReport content={thinking} /></div>
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
          {handoff && (
            <div className={styles.nodeSection}>
              <details>
                <summary className={styles.nodeSectionTitle}>📤 阶段输出（展开查看，最终结论见下方）</summary>
                <HandoffDisplay text={handoff} />
              </details>
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
  if (!isLegacyHandoff(text)) {
    return <div className={styles.nodeHandoff}><MarkdownReport content={text} /></div>
  }
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
            — {tc.resultPreview}
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
