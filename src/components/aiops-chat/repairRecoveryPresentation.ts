import type { PodObservation, RecoveryEvent, RecoverySummary } from './repairWorkspaceApi'

/** One-line Pod state for before/after tables; never guesses beyond the observation. */
export function describeObservation(obs?: PodObservation | null): string {
  if (!obs) return '未观测'
  if (obs.exists === null || obs.exists === undefined) return obs.error ? `观测失败：${obs.error}` : '未知'
  if (!obs.exists) return 'Pod 不存在（已删除）'
  const parts = [obs.phase || '未知阶段', obs.ready ? 'Ready' : 'NotReady']
  if (obs.reason && !obs.ready) parts.push(String(obs.reason))
  if (obs.deletion_timestamp) parts.push('删除中')
  if (typeof obs.restarts === 'number') parts.push(`重启 ${obs.restarts}`)
  if (obs.replaced) parts.push(`替代 ${obs.replaced}`)
  return `${obs.pod ? obs.pod + ' · ' : ''}${parts.join(' · ')}`
}

export function describeRecoveryProgress(event: RecoveryEvent): string {
  return `观察恢复中 ${event.elapsed_seconds}/${event.timeout_seconds} 秒 · ${describeObservation(event.observed)} · ${event.reason}`
}

export function describeRecoveryOutcome(summary: RecoverySummary): { icon: string; label: string; tone: 'success' | 'timeout' | 'neutral' } {
  if (summary.status === 'recovered') return { icon: '✅', label: '已恢复', tone: 'success' }
  if (summary.status === 'not_recovered') return { icon: '⏱', label: `超时未恢复（${summary.timeout_seconds} 秒）`, tone: 'timeout' }
  return { icon: '🔎', label: '恢复状态未能确认', tone: 'neutral' }
}
