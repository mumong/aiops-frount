import { useState } from 'react'
import { RemediationApproval } from './types'
import styles from './MessageList.module.css'

interface RemediationApprovalCardProps {
  approval: RemediationApproval
  /** Whether this is the first pending approval (the one currently awaiting action) */
  isCurrent: boolean
  /** Called when user clicks approve or reject */
  onRespond: (approvalId: string, approved: boolean, reason?: string) => void
}

export default function RemediationApprovalCard({
  approval,
  isCurrent,
  onRespond,
}: RemediationApprovalCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (approved: boolean) => {
    if (submitting || done) return
    setSubmitting(true)
    setError(null)
    try {
      await onRespond(
        approval.approvalId,
        approved,
        approved ? undefined : '用户不认可修复方案',
      )
      setDone(approved ? 'approved' : 'rejected')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '审批请求失败')
    } finally {
      setSubmitting(false)
    }
  }

  const approvalLabel = approval.type === 'plan' ? '🛠️ 修复方案' : '🔧 修复动作'
  const doneLabel = done === 'approved' ? '✅ 已同意' : done === 'rejected' ? '❌ 已拒绝' : null

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
            disabled={submitting}
          >
            {submitting ? '⏳ 提交中...' : '✅ 同意'}
          </button>
          <button
            className={`${styles.remediationBtn} ${styles.remediationBtnReject}`}
            onClick={() => handleAction(false)}
            disabled={submitting}
          >
            {submitting ? '⏳ 提交中...' : '❌ 拒绝'}
          </button>
        </div>
      )}
    </div>
  )
}
