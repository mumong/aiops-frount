import { memo } from 'react'
import { Brain } from 'lucide-react'
import styles from './MessageList.module.css'

/** Raw provider reasoning, collapsed by default and kept apart from the analysis. */
function ReasoningDetails({ text, live = false, label = '模型思考过程' }: { text: string; live?: boolean; label?: string }) {
  return (
    <details className={styles.nodeSection}>
      <summary className={styles.nodeSectionTitle}>
        <Brain size={13} />{label}{live ? ' · 实时更新' : ''}（{text.length} 字，原始推理，仅供参考）
      </summary>
      <div className={styles.reasoningText}>{text}</div>
    </details>
  )
}

export default memo(ReasoningDetails)
