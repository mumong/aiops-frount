import { Sun, Moon, ChevronRight } from 'lucide-react'
import { useWorkspaceTheme } from './WorkspaceTheme'
import styles from './ChatHeader.module.css'

interface ChatHeaderProps {
  title: string
  isConnected: boolean
}

export default function ChatHeader({ title, isConnected }: ChatHeaderProps) {
  const { mode, toggle } = useWorkspaceTheme()
  return <header className={styles.header}>
    <div className={styles.left}>
      <span className={styles.breadcrumb}>{title}</span><ChevronRight size={13} className={styles.breadcrumb} />
      <h1 className={styles.title}>运维工作台</h1>
      {!isConnected && <span className={styles.activity}><span />处理中</span>}
    </div>
    <div className={styles.actions}>
      <button className={styles.themeButton} onClick={toggle} title={mode === 'light' ? '切换深色主题' : '切换浅色主题'}
        aria-label={mode === 'light' ? '切换深色主题' : '切换浅色主题'}>
        {mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    </div>
  </header>
}
