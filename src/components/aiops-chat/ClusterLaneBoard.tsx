import { useId, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, CircleX, LoaderCircle } from 'lucide-react'
import ReasoningDetails from './ReasoningDetails'
import StructuredContent from './StructuredContent'
import { visibleNarrative } from './handoffPresentation'
import { laneTools } from './clusterLanes'
import type { ClusterLane, NodeBlock, ToolCall } from './types'
import styles from './ParallelEvidenceBoard.module.css'

const STATUS_TEXT: Record<ClusterLane['status'], string> = {
  running: '进行中',
  complete: '已完成',
  failed: '未完成',
}

/** Multi-cluster location: one card per cluster with its progress, tools and analysis. */
export default function ClusterLaneBoard({ block }: { block: NodeBlock }) {
  const lanes = block.clusterLanes || []
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const done = lanes.filter(lane => lane.status !== 'running').length
  const failed = lanes.filter(lane => lane.status === 'failed').length
  const tools = block.toolCalls.filter(tool => tool.clusterLabel).length
  const running = block.status === 'running' && done < lanes.length

  function toggle(label: string) {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <section className={styles.board} aria-label="多集群并发定位">
      <div className={styles.summaryHeader}>
        <div>
          <div className={styles.eyebrow}>MULTI-CLUSTER</div>
          <h3 className={styles.title}>{lanes.length} 个集群并发定位</h3>
        </div>
        <span className={`${styles.streamState} ${running ? styles.running : styles.complete}`}>
          <span className={styles.stateDot} />
          {running ? '定位进行中' : '定位已结束'}
        </span>
      </div>

      <div className={styles.totals} aria-label="定位进度">
        <span><strong>{done}/{lanes.length}</strong>已结束</span>
        <span><strong>{tools}</strong>工具调用</span>
        <span className={failed > 0 ? styles.failedTotal : ''}><strong>{failed}</strong>未完成</span>
      </div>

      <div className={styles.groupGrid}>
        {lanes.map(lane => (
          <LaneCard
            key={lane.label}
            lane={lane}
            tools={laneTools(block, lane.label)}
            live={block.status === 'running'}
            expanded={expanded.has(lane.label)}
            onToggle={() => toggle(lane.label)}
          />
        ))}
      </div>
    </section>
  )
}

function LaneCard({ lane, tools, live, expanded, onToggle }: {
  lane: ClusterLane
  tools: ToolCall[]
  live: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const contentId = useId()
  const pending = tools.filter(tool => tool.status === 'running').length
  const failedTools = tools.filter(tool => tool.status === 'error').length
  const analysis = visibleNarrative(lane.analysis.text)
  const reasoning = lane.reasoning.trim()
  const icon = lane.status === 'running'
    ? <LoaderCircle size={14} aria-label="进行中" />
    : lane.status === 'complete' ? <CheckCircle2 size={14} aria-label="已完成" /> : <CircleAlert size={14} aria-label="未完成" />

  return (
    <article className={`${styles.groupCard} ${expanded ? styles.groupExpanded : ''}`}>
      <button type="button" className={styles.groupButton} aria-expanded={expanded}
        aria-controls={contentId} onClick={onToggle}>
        <span className={styles.groupTopline}>
          <span className={styles.groupId}>{lane.label}</span>
          <span className={styles.groupType}>{STATUS_TEXT[lane.status]}</span>
          <span className={styles.groupToggle} aria-hidden="true">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
        </span>
        <span className={`${styles.cardFooter} ${lane.status === 'failed' ? styles.failureBadge : ''}`} role="status">
          {icon}{lane.note || '等待开始'}
        </span>
        <span className={styles.cardFooter}>
          <span>工具 {tools.length}</span>
          {pending > 0 && <span>{pending} 个执行中</span>}
          {failedTools > 0 && <span className={styles.failureBadge}>{failedTools} 失败</span>}
        </span>
      </button>

      {reasoning && <ReasoningDetails text={reasoning} live={live && lane.status === 'running'}
        label={`${lane.label} · 模型思考过程`} />}
      {analysis && (
        <section className={styles.groupBody} aria-label={`${lane.label} 定位分析`}>
          <div className={styles.noticeTitle}>定位分析 · 模型输出</div>
          <StructuredContent text={analysis} analysis />
        </section>
      )}

      {expanded && (
        <div className={styles.groupBody} id={contentId}>
          {tools.length > 0 ? (
            <div className={styles.resultList}>
              {tools.map(tool => <LaneTool key={tool.id} tool={tool} />)}
            </div>
          ) : (
            <div className={styles.emptyResult}>该集群暂无工具调用。</div>
          )}
        </div>
      )}
    </article>
  )
}

function LaneTool({ tool }: { tool: ToolCall }) {
  return (
    <article className={`${styles.resultItem} ${tool.status === 'error' ? styles.resultError : ''}`}>
      <div className={styles.resultHeader}>
        <span className={styles.resultStatus}>
          {tool.status === 'running' ? <LoaderCircle size={14} aria-label="执行中" />
            : tool.status === 'success' ? <CheckCircle2 size={14} aria-label="成功" /> : <CircleX size={14} aria-label="失败" />}
        </span>
        <code className={styles.toolName}>{tool.toolName}</code>
      </div>
      {tool.resultPreview && <pre className={styles.preview}><code>{tool.resultPreview}</code></pre>}
      {tool.resultData && (
        <details className={styles.rawDetails}>
          <summary>查看完整工具结果摘要</summary>
          <StructuredContent text={tool.resultData} />
        </details>
      )}
    </article>
  )
}
