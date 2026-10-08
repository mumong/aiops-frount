import { Activity, Search, Sun, Moon, ChevronRight } from 'lucide-react'
import type { EndpointMode } from './types'
import { useWorkspaceTheme } from './WorkspaceTheme'
import styles from './ChatHeader.module.css'

interface ChatHeaderProps {
  title: string
  isConnected: boolean
  endpointMode: EndpointMode
  onEndpointChange: (mode: EndpointMode) => void
}

export default function ChatHeader({ title, isConnected, endpointMode, onEndpointChange }: ChatHeaderProps) {
  const { mode, toggle } = useWorkspaceTheme()
  return <header className={styles.header}>
    <div className={styles.left}>
      <span className={styles.breadcrumb}>{title}</span><ChevronRight size={13} className={styles.breadcrumb} />
      <h1 className={styles.title}>运维工作台</h1>
      {!isConnected && <span className={styles.activity}><span />处理中</span>}
    </div>
    <div className={styles.actions}>
      <div className={styles.endpointSwitch} role="group" aria-label="对话模式">
        <button className={`${styles.switchBtn} ${endpointMode === 'ask' ? styles.active : ''}`}
          aria-pressed={endpointMode === 'ask'} onClick={() => onEndpointChange('ask')}>
          <Activity size={14} />诊断
        </button>
        <button className={`${styles.switchBtn} ${endpointMode === 'query' ? styles.active : ''}`}
          aria-pressed={endpointMode === 'query'} onClick={() => onEndpointChange('query')}>
          <Search size={14} />查询
        </button>
      </div>
      <button className={styles.themeButton} onClick={toggle} title={mode === 'light' ? '切换深色主题' : '切换浅色主题'}
        aria-label={mode === 'light' ? '切换深色主题' : '切换浅色主题'}>
        {mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    </div>
  </header>
}
