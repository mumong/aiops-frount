import styles from './MessageList.module.css'
import { UserRound } from 'lucide-react'

interface UserMessageProps {
  content: string
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>
        {content}
      </div>
      <span className={styles.avatar} aria-label="你"><UserRound size={16} /></span>
    </div>
  )
}
