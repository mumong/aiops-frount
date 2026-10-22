import { useId, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import styles from './ParallelEvidenceBoard.module.css'

export type RunStatus = 'running' | 'complete' | 'failed' | 'partial'

const STATUS_TEXT: Record<RunStatus, string> = {
  running: '进行中', complete: '已完成', failed: '未完成', partial: '部分完成',
}

/**
 * One agent run as a full-width row. The header has a fixed height (title, meta,
 * one-line summary) so live updates never reflow the page; details open below.
 */
export default function RunRow({ title, badge, status, meta, summary, children, defaultOpen = false }: {
  title: ReactNode
  badge?: string
  status: RunStatus
  meta: string[]
  summary: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  return (
    <article className={`${styles.row} ${open ? styles.rowOpen : ''}`} data-status={status}>
      <button type="button" className={styles.rowHead} aria-expanded={open} aria-controls={bodyId}
        onClick={() => setOpen(!open)}>
        <span className={styles.rowIcon} aria-label={STATUS_TEXT[status]}>
          {status === 'running' ? <LoaderCircle size={15} className={styles.spin} />
            : status === 'complete' ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
        </span>
        <span className={styles.rowMain}>
          <span className={styles.rowTitleLine}>
            {badge && <span className={styles.rowBadge}>{badge}</span>}
            <span className={styles.rowTitle}>{title}</span>
            <span className={styles.rowMeta}>
              <span className={styles.rowState}>{STATUS_TEXT[status]}</span>
              {meta.map(item => <span key={item}>{item}</span>)}
            </span>
          </span>
          <span className={styles.rowSummary} role={status === 'running' ? 'status' : undefined}>{summary || ' '}</span>
        </span>
        <span className={styles.rowChevron} aria-hidden="true">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {open && <div className={styles.rowBody} id={bodyId}>{children}</div>}
    </article>
  )
}
