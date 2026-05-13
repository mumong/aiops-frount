import styles from './ChatHeader.module.css'

interface ChatHeaderProps {
  title: string
  isConnected: boolean
  endpointMode: 'ask' | 'query'
  onEndpointChange: (mode: 'ask' | 'query') => void
}

export default function ChatHeader({ title, isConnected, endpointMode, onEndpointChange }: ChatHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <span className={styles.icon}>🤖</span>
        <span className={styles.title}>{title}</span>
        <span className={`${styles.dot} ${isConnected ? styles.dotConnected : styles.dotDisconnected}`} />
      </div>
      <div className={styles.endpointSwitch}>
        <button
          className={`${styles.switchBtn} ${endpointMode === 'ask' ? styles.active : ''}`}
          onClick={() => onEndpointChange('ask')}
        >
          🔍 诊断
        </button>
        <button
          className={`${styles.switchBtn} ${endpointMode === 'query' ? styles.active : ''}`}
          onClick={() => onEndpointChange('query')}
        >
          📊 查询
        </button>
      </div>
    </div>
  )
}
