import StructuredContent from './StructuredContent'
import RunRow from './RunRow'
import TraceTimeline, { type TraceTool } from './TraceTimeline'
import { visibleNarrative } from './handoffPresentation'
import { laneTools } from './clusterLanes'
import { latestActivity } from './traceModel'
import type { NodeBlock } from './types'
import styles from './ParallelEvidenceBoard.module.css'

/** Multi-cluster location: one full-width row per cluster with its own run timeline. */
export default function ClusterLaneBoard({ block }: { block: NodeBlock }) {
  const lanes = block.clusterLanes || []
  const done = lanes.filter(lane => lane.status !== 'running').length
  const failed = lanes.filter(lane => lane.status === 'failed').length
  const live = block.status === 'running'

  return (
    <section className={styles.board} aria-label="多集群并发定位">
      <div className={styles.boardHead}>
        <span className={styles.boardTitle}>{lanes.length} 个集群并发定位</span>
        <span className={styles.boardMeta}>
          {done}/{lanes.length} 已结束{failed > 0 && <span className={styles.danger}> · {failed} 个未完成</span>}
        </span>
      </div>
      {lanes.map(lane => {
        const tools = laneTools(block, lane.label)
        const lookup = (id: string): TraceTool | undefined => tools.find(tool => tool.id === id)
        const steps = lane.trace || []
        const analysis = visibleNarrative(lane.analysis.text)
        const running = lane.status === 'running' && live
        const summary = running
          ? latestActivity(steps, id => lookup(id)?.toolName || '工具') || lane.note || '等待开始'
          : lane.note
        return (
          <RunRow key={lane.label} badge={lane.label} title="问题定位"
            status={lane.status === 'running' ? (live ? 'running' : 'partial') : lane.status}
            meta={[`工具 ${tools.length}`]} summary={summary}>
            <TraceTimeline steps={steps} tool={lookup} live={running} reasoning={lane.reasoning} />
            {analysis && !steps.some(step => step.kind === 'text') && (
              <section className={styles.conclusion} aria-label={`${lane.label} 定位分析`}>
                <div className={styles.conclusionLabel}>定位结论</div>
                <StructuredContent text={analysis} analysis />
              </section>
            )}
          </RunRow>
        )
      })}
    </section>
  )
}
