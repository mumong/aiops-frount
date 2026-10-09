import { useState, useEffect } from 'react'
import { NODE_LABELS, type NodeBlock } from './types'
import MarkdownReport from './MarkdownReport'
import ParallelEvidenceBoard from './ParallelEvidenceBoard'
import HandoffDisplay from './HandoffDisplay'
import { emptyNodeMessage, visibleNarrative, queryNarrative } from './handoffPresentation'
import styles from './MessageList.module.css'
import { LoaderCircle, CheckCircle2, CircleStop, CircleX, ChevronDown, ChevronRight, Wrench, ScanText, CornerDownRight } from 'lucide-react'
import CodeBlock from './CodeBlock'

/** Collapsible card for a single workflow node */
export default function NodeBlockCard({ block, isLast }: { block: NodeBlock; isLast: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const label = (NODE_LABELS[block.nodeId] || block.nodeName).replace(/^[^\p{L}\p{N}]+/u, '')
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
          {isRunning ? <LoaderCircle size={16} className={styles.spinner} aria-label="执行中" /> : isComplete ? <CheckCircle2 size={16} aria-label="已结束" /> : <CircleStop size={16} aria-label="已停止" />}
        </span>
        <span className={styles.nodeLabel}>{label}</span>
        {block.toolCalls.length > 0 && <span className={styles.nodeDuration}>工具 {block.toolCalls.length}</span>}
        {isRunning && isLast && <span className={styles.nodePulse}>执行中...</span>}
        {isComplete && block.durationSeconds != null && (
          <span className={styles.nodeDuration}>{formatDuration(block.durationSeconds)}</span>
        )}
        <span className={styles.nodeToggle}>{showBody ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
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
              <div className={styles.nodeSectionTitle}><ScanText size={13} />分析过程{isRunning ? ' · 实时更新' : ''}</div>
              <div className={styles.nodeAnalysis}><MarkdownReport content={thinking} /></div>
            </div>
          )}

          {/* Tool calls */}
          {block.toolCalls.length > 0 && (
            <div className={styles.nodeSection}>
              <div className={styles.nodeSectionTitle}><Wrench size={13} />工具调用 ({block.toolCalls.length})</div>
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
                <summary className={styles.nodeSectionTitle}><CornerDownRight size={13} />阶段结果（非最终结论）</summary>
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

/** Individual tool call item — clickable to show full result data */
function ToolCallItem({ tc }: { tc: import('./types').ToolCall }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const hasDetail = tc.status !== 'running' && tc.resultData

  return (
    <div>
      <button
        type="button"
        aria-expanded={hasDetail ? detailOpen : undefined}
        disabled={!hasDetail}
        className={`${styles.toolCall} ${hasDetail ? styles.toolCallClickable : ''}`}
        onClick={() => hasDetail && setDetailOpen(!detailOpen)}
      >
        <span className={
          tc.status === 'running' ? styles.toolCallRunning
          : tc.status === 'success' ? styles.toolCallSuccess
          : styles.toolCallError
        }>
          {tc.status === 'running' ? <LoaderCircle size={14} className={styles.spinner} aria-label="执行中" /> : tc.status === 'success' ? <CheckCircle2 size={14} aria-label="成功" /> : <CircleX size={14} aria-label="失败" />}
        </span>
        <code className={styles.toolCallName}>{tc.toolName}</code>
        {tc.resultPreview && (
          <span className={styles.toolCallPreview}>
            — {tc.resultPreview}
          </span>
        )}
        {hasDetail && (
          <span className={styles.toolDetailToggle}>{detailOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        )}
      </button>
      {detailOpen && hasDetail && (
        <CodeBlock className={styles.toolDetailBody} text={tc.resultData} label={tc.toolName} />
      )}
    </div>
  )
}
