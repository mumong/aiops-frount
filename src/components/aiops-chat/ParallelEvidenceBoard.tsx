import { CheckCircle2, CircleAlert } from 'lucide-react'
import CodeBlock from './CodeBlock'
import StructuredContent from './StructuredContent'
import RunRow, { type RunStatus } from './RunRow'
import TraceTimeline, { type TraceTool } from './TraceTimeline'
import { visibleNarrative } from './handoffPresentation'
import { latestActivity } from './traceModel'
import type { ParallelEvidenceGroup, ParallelEvidenceResult, ParallelEvidenceState } from './types'
import { groupDisplayName } from './parallelEvidenceModel'
import styles from './ParallelEvidenceBoard.module.css'

/**
 * Parallel evidence + RCA: one row per abnormal group, grouped under its cluster.
 * A row's header carries the conclusion once RCA delivers; the body is the run
 * timeline (reasoning, tool calls and stage text in arrival order).
 */
export default function ParallelEvidenceBoard({ state }: { state: ParallelEvidenceState }) {
  const results = [...state.groups.flatMap(group => group.results), ...state.unassignedResults]
  const failed = results.filter(result => result.status === 'error').length
  const ended = state.groups.filter(group => group.terminalStatus).length
  const running = state.status === 'running'
  const clusters = [...new Set(state.groups.map(group => group.clusterLabel || ''))]

  return (
    <section className={styles.board} aria-label="并发证据采集总览">
      <div className={styles.boardHead}>
        <span className={styles.boardTitle}>{state.groups.length} 个异常组 · 并发取证与根因分析</span>
        <span className={styles.boardMeta} aria-label="采集统计">
          {ended}/{state.groups.length} 组已结束 · {results.length} 条证据
          {failed > 0 && <span className={styles.danger}> · {failed} 条失败</span>}
          {state.pendingTools.length > 0 && ` · ${state.pendingTools.length} 条${running ? '执行中' : '未返回'}`}
          {running ? '' : ' · 本阶段已结束'}
        </span>
      </div>

      {clusters.map(cluster => {
        const own = state.groups.filter(group => (group.clusterLabel || '') === cluster)
        return (
          <div key={cluster || 'single'} className={styles.clusterSection}>
            {cluster && (
              <div className={styles.clusterHead}>
                <span className={styles.clusterName}>{cluster}</span>
                <span className={styles.boardMeta}>{own.filter(group => group.terminalStatus).length}/{own.length} 组已结束</span>
              </div>
            )}
            {own.map(group => <GroupRow key={group.groupId} group={group} state={state} live={running} />)}
          </div>
        )
      })}

      {!running && state.pendingTools.length > 0 && (
        <div className={styles.notice}>
          {state.pendingTools.length} 条工具调用未收到结果（阶段已结束，不再等待）：
          {state.pendingTools.map(tool => <code key={tool.id}>{tool.toolName}</code>)}
        </div>
      )}
      {state.unassignedResults.length > 0 && (
        <details className={styles.notice} aria-label="未归属证据">
          <summary><CircleAlert size={13} /> {state.unassignedResults.length} 条未归属结果（没有唯一的 namespace/Pod 标识，原始证据已保留，未推测归组）</summary>
          {state.unassignedResults.map(result => <ResultItem key={result.id} result={result} />)}
        </details>
      )}
    </section>
  )
}

function conclusionLine(text: string): string {
  const first = visibleNarrative(text).split(/\n+/).find(line => line.trim()) || ''
  return first.replace(/\*\*/g, '').replace(/^诊断结论[:：]\s*/, '').trim()
}

function GroupRow({ group, state, live }: { group: ParallelEvidenceGroup; state: ParallelEvidenceState; live: boolean }) {
  const lookup = (id: string): TraceTool | undefined =>
    group.results.find(result => result.id === id) || state.pendingTools.find(tool => tool.id === id)
  const rca = group.analysisStreams?.rca?.text || ''
  // The RCA conclusion heads the row; keep it out of the timeline to avoid showing it twice.
  const steps = (group.trace || []).filter(step => !(group.terminalStatus && rca.trim()
    && step.kind === 'text' && step.stage === 'rca'))
  const failed = group.results.filter(result => result.status === 'error').length
  const status: RunStatus = group.terminalStatus
    ? (group.terminalStatus === 'partial' || group.error ? 'partial' : 'complete')
    : live ? 'running' : 'partial'
  const summary = status === 'running'
    ? latestActivity(steps, id => lookup(id)?.toolName || '工具') || group.runtimeStatus || '等待开始'
    : conclusionLine(rca) || group.error || group.runtimeStatus || ''
  const pods = group.entities.map(entity => `${entity.namespace}/${entity.name}`).join('、')
  return (
    <RunRow badge={groupDisplayName(group.groupId)} title={<code>{pods || group.abnormalType}</code>}
      status={status} summary={summary}
      meta={[`证据 ${group.results.length}`, ...(failed ? [`${failed} 失败`] : [])]}>
      {status !== 'running' && rca.trim() && (
        <section className={styles.conclusion} aria-label={`${groupDisplayName(group.groupId)} 结论`}>
          <StructuredContent text={visibleNarrative(rca)} analysis />
        </section>
      )}
      {steps.length > 0
        ? <TraceTimeline steps={steps} tool={lookup} live={status === 'running'}
            reasoning={Object.values(group.reasoningStreams || {}).join('\n\n')} />
        : <LegacyGroup group={group} />}
    </RunRow>
  )
}

/** Sessions saved before the run timeline existed: their analysis and results as stored. */
function LegacyGroup({ group }: { group: ParallelEvidenceGroup }) {
  const evidence = visibleNarrative(group.analysisStreams?.evidence?.text || '')
  return (
    <>
      {evidence && <StructuredContent text={evidence} analysis />}
      {group.results.length > 0
        ? group.results.map(result => <ResultItem key={result.id} result={result} />)
        : <div className={styles.notice}>{group.terminalStatus ? '该分支没有返回可展示证据。' : '等待该异常组的证据返回…'}</div>}
    </>
  )
}

function ResultItem({ result }: { result: ParallelEvidenceResult }) {
  return (
    <details className={`${styles.result} ${result.status === 'error' ? styles.resultError : ''}`}>
      <summary>
        {result.status === 'success' ? <CheckCircle2 size={13} aria-label="成功" /> : <CircleAlert size={13} aria-label="失败" />}
        <code>{result.toolName}</code>
        <span className={styles.resultPreview}>{result.resultPreview}</span>
      </summary>
      {result.resultData && <CodeBlock text={result.resultData} label={result.toolName} />}
    </details>
  )
}
