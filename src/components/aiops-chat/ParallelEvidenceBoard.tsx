import { useState } from 'react'
import type {
  EvidenceDimension,
  ParallelEvidenceGroup,
  ParallelEvidenceResult,
  ParallelEvidenceState,
} from './types'
import { dimensionCounts } from './parallelEvidenceModel'
import styles from './ParallelEvidenceBoard.module.css'

const DIMENSION_LABELS: Record<EvidenceDimension, string> = {
  kubernetes: 'Kubernetes',
  metrics: 'Metrics',
  logging: 'Logging',
  tracing: 'Tracing',
  topology: 'Topology',
  other: 'Other',
}

export default function ParallelEvidenceBoard({
  state,
}: {
  state: ParallelEvidenceState
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const groupedResults = state.groups.flatMap(group => group.results)
  const allResults = [...groupedResults, ...state.unassignedResults]
  const failedCount = allResults.filter(result => result.status === 'error').length

  function toggleGroup(groupId: string) {
    setExpandedGroups(previous => {
      const next = new Set(previous)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <section className={styles.board} aria-label="并发证据采集总览">
      <div className={styles.summaryHeader}>
        <div>
          <div className={styles.eyebrow}>PARALLEL EVIDENCE</div>
          <h3 className={styles.title}>{state.groups.length} 个异常组</h3>
        </div>
        <span className={`${styles.streamState} ${state.status === 'running' ? styles.running : styles.complete}`}>
          <span className={styles.stateDot} />
          {state.status === 'running' ? '持续接收结果' : '采集已完成'}
        </span>
      </div>

      {state.status === 'running' && <div className={styles.streamBar} aria-hidden="true" />}

      <div className={styles.totals} aria-label="采集统计">
        <span><strong>{allResults.length}</strong>已返回</span>
        <span><strong>{state.pendingTools.length}</strong>执行中</span>
        <span className={failedCount > 0 ? styles.failedTotal : ''}><strong>{failedCount}</strong>失败</span>
      </div>

      {state.pendingTools.length > 0 && (
        <div className={styles.pendingArea}>
          <div className={styles.noticeTitle}>
            <span className={styles.pendingSpinner} aria-hidden="true" />
            {state.pendingTools.length} 条工具调用等待结果归组
          </div>
          <div className={styles.pendingTools}>
            {state.pendingTools.map(tool => <code key={tool.id}>{tool.toolName}</code>)}
          </div>
        </div>
      )}

      <div className={styles.groupGrid}>
        {state.groups.map(group => {
          const expanded = expandedGroups.has(group.groupId)
          return (
            <GroupCard
              key={group.groupId}
              group={group}
              expanded={expanded}
              onToggle={() => toggleGroup(group.groupId)}
            />
          )
        })}
      </div>

      {state.unassignedResults.length > 0 && (
        <section className={styles.unassigned} aria-label="未归属证据">
          <div className={styles.noticeTitle}>⚠ {state.unassignedResults.length} 条未归属结果</div>
          <p>返回内容没有唯一的 namespace/Pod 标识，原始证据已保留，未进行推测归组。</p>
          <div className={styles.resultList}>
            {state.unassignedResults.map(result => <ResultItem key={result.id} result={result} />)}
          </div>
        </section>
      )}
    </section>
  )
}

function GroupCard({
  group,
  expanded,
  onToggle,
}: {
  group: ParallelEvidenceGroup
  expanded: boolean
  onToggle: () => void
}) {
  const counts = dimensionCounts(group)
  const failedCount = group.results.filter(result => result.status === 'error').length
  const contentId = `parallel-evidence-${group.groupId.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <article className={`${styles.groupCard} ${expanded ? styles.groupExpanded : ''}`}>
      <button
        type="button"
        className={styles.groupButton}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className={styles.groupTopline}>
          <span className={styles.groupId}>{group.groupId}</span>
          <span className={styles.groupType}>{group.abnormalType}</span>
          <span className={styles.groupToggle} aria-hidden="true">{expanded ? '−' : '+'}</span>
        </span>
        <span className={styles.entities}>
          {group.entities.map(entity => (
            <code key={`${entity.namespace}/${entity.name}`}>{entity.namespace}/{entity.name}</code>
          ))}
        </span>
        <span className={styles.cardFooter}>
          <span>{group.results.length} 条证据</span>
          {failedCount > 0 && <span className={styles.failureBadge}>{failedCount} 失败</span>}
          <DimensionBadges counts={counts} />
        </span>
      </button>

      {expanded && (
        <div className={styles.groupBody} id={contentId}>
          {group.statusKeywords.length > 0 && (
            <div className={styles.keywords}>
              {group.statusKeywords.map(keyword => <span key={keyword}>{keyword}</span>)}
            </div>
          )}
          {group.results.length > 0 ? (
            <div className={styles.resultList}>
              {group.results.map(result => <ResultItem key={result.id} result={result} />)}
            </div>
          ) : (
            <div className={styles.emptyResult}>等待该异常组的证据返回…</div>
          )}
        </div>
      )}
    </article>
  )
}

function DimensionBadges({
  counts,
}: {
  counts: Record<EvidenceDimension, number>
}) {
  return (
    <span className={styles.dimensionBadges} aria-label="可观测性维度">
      {(Object.keys(DIMENSION_LABELS) as EvidenceDimension[])
        .filter(dimension => counts[dimension] > 0)
        .map(dimension => (
          <span key={dimension} className={styles.dimensionBadge} data-dimension={dimension}>
            {DIMENSION_LABELS[dimension]} {counts[dimension]}
          </span>
        ))}
    </span>
  )
}

function ResultItem({ result }: { result: ParallelEvidenceResult }) {
  return (
    <article className={`${styles.resultItem} ${result.status === 'error' ? styles.resultError : ''}`}>
      <div className={styles.resultHeader}>
        <span className={styles.resultStatus}>{result.status === 'success' ? '✓' : '!'}</span>
        <code className={styles.toolName}>{result.toolName}</code>
        <span className={styles.resultDimension}>{DIMENSION_LABELS[result.dimension]}</span>
        {result.sourceSystem && <span className={styles.sourceSystem}>{result.sourceSystem}</span>}
      </div>
      {result.entity && (
        <code className={styles.resultEntity}>{result.entity.namespace}/{result.entity.name}</code>
      )}
      <pre className={styles.preview}><code>{result.resultPreview}</code></pre>
      {result.resultData && (
        <details className={styles.rawDetails}>
          <summary>查看完整原始结果</summary>
          <pre><code>{result.resultData}</code></pre>
        </details>
      )}
    </article>
  )
}
