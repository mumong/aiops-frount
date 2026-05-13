import { ChatSession } from './types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  isOpen: boolean
  onToggle: () => void
}

export default function Sidebar({ sessions, activeId, onSelect, onDelete, onNew, isOpen, onToggle }: SidebarProps) {
  if (!isOpen) {
    return (
      <div className={styles.collapsed}>
        <button className={styles.toggleBtn} onClick={onToggle} title="展开历史会话">
          ☰
        </button>
      </div>
    )
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>历史会话</span>
        <div className={styles.headerBtns}>
          <button className={styles.newBtn} onClick={onNew} title="新建会话">
            ＋
          </button>
          <button className={styles.toggleBtn} onClick={onToggle} title="收起">
            ✕
          </button>
        </div>
      </div>
      <div className={styles.list}>
        {sessions.length === 0 && (
          <div className={styles.empty}>暂无历史会话</div>
        )}
        {[...sessions].reverse().map(s => (
          <div
            key={s.id}
            className={`${styles.item} ${s.id === activeId ? styles.active : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <div className={styles.itemTitle}>{s.title}</div>
            <div className={styles.itemMeta}>
              <span className={styles.itemDate}>{fmtDate(s.updatedAt)}</span>
              <button
                className={styles.deleteBtn}
                onClick={e => {
                  e.stopPropagation()
                  onDelete(s.id)
                }}
                title="删除会话"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m 前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h 前`
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
