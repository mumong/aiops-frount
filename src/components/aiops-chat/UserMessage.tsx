import styles from './MessageList.module.css'

interface UserMessageProps {
  content: string
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>
        {content}
      </div>
      <span className={styles.avatar}>👤</span>
    </div>
  )
}
