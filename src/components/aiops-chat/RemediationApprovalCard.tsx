import { useEffect, useRef, useState } from 'react'
import { RemediationApproval } from './types'
import {
  APPROVAL_CONTINUATION_TIMEOUT_MS,
  ApprovalContinuationStatus,
  getApprovalContinuationPresentation,
} from './remediationApprovalContinuation'
import styles from './MessageList.module.css'

interface RemediationApprovalCardProps {
  approval: RemediationApproval
  /** Whether this is the first pending approval (the one currently awaiting action) */
  isCurrent: boolean
  /** Whether the original SSE stream is still open to receive follow-up events */
  streamActive: boolean
  /** Monotonic marker incremented when an SSE event arrives */
  activitySeq: number
  /** Called when user clicks approve or reject */
  onRespond: (approvalId: string, approved: boolean, reason?: string) => void
}

export default function RemediationApprovalCard({
  approval,
  isCurrent,
  streamActive,
  activitySeq,
  onRespond,
}: RemediationApprovalCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [continuationStatus, setContinuationStatus] = useState<ApprovalContinuationStatus>('idle')
  const submittedActivitySeqRef = useRef<number | null>(null)
  const continuationTimerRef = useRef<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const remainingSeconds = approval.expiresAt == null ? null : Math.max(0, Math.ceil((approval.expiresAt - now) / 1000))
  const unavailable = !isCurrent || !streamActive || remainingSeconds === 0

  useEffect(() => {
    if (done || approval.expiresAt == null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [done, approval.expiresAt])

  const clearContinuationTimer = () => {
    if (continuationTimerRef.current != null) {
      window.clearTimeout(continuationTimerRef.current)
      continuationTimerRef.current = null
    }
  }

  useEffect(() => {
    if (
      continuationStatus === 'waiting' &&
      submittedActivitySeqRef.current != null &&
      activitySeq > submittedActivitySeqRef.current
    ) {
      clearContinuationTimer()
      setContinuationStatus('continued')
    }
  }, [activitySeq, continuationStatus])

  useEffect(() => clearContinuationTimer, [])

  const handleAction = async (approved: boolean) => {
    if (submitting || done || unavailable) return
    setSubmitting(true)
    setError(null)
    try {
      await onRespond(
        approval.approvalId,
        approved,
        approved ? undefined : '用户不认可修复方案',
      )
      setDone(approved ? 'approved' : 'rejected')
      submittedActivitySeqRef.current = activitySeq
      if (!approved) {
        setContinuationStatus('continued')
      } else if (!streamActive) {
        setContinuationStatus('stream_closed')
      } else {
        setContinuationStatus('waiting')
        clearContinuationTimer()
        continuationTimerRef.current = window.setTimeout(() => {
          setContinuationStatus(current => current === 'waiting' ? 'timed_out' : current)
          continuationTimerRef.current = null
        }, APPROVAL_CONTINUATION_TIMEOUT_MS)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '审批请求失败')
    } finally {
      setSubmitting(false)
    }
  }

  const approvalLabel = approval.type === 'plan' ? '🛠️ 修复方案' : '🔧 修复动作'
  const doneLabel = done === 'approved' ? '✅ 已同意' : done === 'rejected' ? '❌ 已拒绝' : null
  const continuation = getApprovalContinuationPresentation(continuationStatus)
  const payload = approval.payload || {}
  const target = payload.target && typeof payload.target === 'object'
    ? payload.target as Record<string, unknown> : {}
  const fields = [['dry_run_command', '预演'], ['execute_command', '执行'], ['verify_command', '验证']] as const

  return (
    <div className={`${styles.remediationCard} ${isCurrent && !done ? styles.remediationCardActive : ''}`}>
      {/* Header */}
      <div className={styles.remediationHeader}>
        <span className={styles.remediationIcon}>
          {done === 'approved' ? '✅' : done === 'rejected' ? '❌' : '⏳'}
        </span>
        <span className={styles.remediationLabel}>{approvalLabel}</span>
      </div>

      {/* Title / description */}
      <div className={styles.remediationBody}>
        <div className={styles.remediationTitle}>{approval.title}</div>
        {approval.description && (
          <div className={styles.remediationDesc}>{approval.description}</div>
        )}
        {approval.payload && (
          <div className={styles.repairPlan}>
            <div className={styles.repairTarget}>
              <span className={styles.repairBadge}>{String(payload.group_id || '当前对象')}</span>
              <strong>{[target.namespace, target.pod].filter(Boolean).map(String).join(' / ') || '修复命令'}</strong>
            </div>
            {typeof payload.risk === 'string' && <div className={styles.repairNote}><strong>风险说明</strong><p>{payload.risk}</p></div>}
            {fields.map(([key, label]) => typeof payload[key] === 'string' && payload[key] ? (
              <div key={key}><div className={styles.repairFieldLabel}>{label}</div>
                <pre className={styles.repairCode}>{String(payload[key])}</pre></div>
            ) : null)}
            {typeof payload.rollback_advice === 'string' && <details className={styles.repairDetails}>
              <summary>回退建议</summary><p>{payload.rollback_advice}</p>
            </details>}
            <details className={styles.repairDetails}>
              <summary>查看完整审批数据</summary><pre className={styles.repairCode}>{JSON.stringify(payload, null, 2)}</pre>
            </details>
          </div>
        )}
        {!done && remainingSeconds !== null && (
          <div role="status" className={styles.repairCountdown}>{remainingSeconds > 0
            ? `审批剩余 ${remainingSeconds} 秒；超时取消，不自动执行。`
            : '审批已过期，未授权执行。'}</div>
        )}
        {!done && !streamActive && <div>连接已结束，请重新发起修复审查。</div>}
        <div className={styles.remediationMeta}>
          <span className={styles.remediationMetaKey}>run_id:</span>
          <code className={styles.remediationMetaValue}>{approval.runId}</code>
          <span className={styles.remediationMetaKey}>approval_id:</span>
          <code className={styles.remediationMetaValue}>{approval.approvalId}</code>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className={styles.remediationError}>
          ❌ {error}
        </div>
      )}

      {/* Action buttons or done state */}
      {doneLabel ? (
        <div className={styles.remediationDone}>
          <span>{doneLabel}</span>
        </div>
      ) : (
        <div className={styles.remediationActions}>
          <button
            className={`${styles.remediationBtn} ${styles.remediationBtnApprove}`}
            onClick={() => handleAction(true)}
            disabled={submitting || unavailable}
          >
            {submitting ? '⏳ 提交中...' : '✅ 同意'}
          </button>
          <button
            className={`${styles.remediationBtn} ${styles.remediationBtnReject}`}
            onClick={() => handleAction(false)}
            disabled={submitting || unavailable}
          >
            {submitting ? '⏳ 提交中...' : '❌ 拒绝'}
          </button>
        </div>
      )}

      {continuation && (
        <div className={continuation.tone === 'warning' ? styles.remediationError : styles.remediationDone}>
          {continuation.text}
        </div>
      )}
    </div>
  )
}
