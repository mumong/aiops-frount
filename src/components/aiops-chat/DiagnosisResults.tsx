import { useState } from 'react'
import type { ChatMessage } from './types'
import MarkdownReport from './MarkdownReport'
import styles from './DiagnosisResults.module.css'

export default function DiagnosisResults({ message }: { message: ChatMessage }) {
  const [visible, setVisible] = useState(10)
  const cases = message.diagnosisCases || []
  const overview = message.diagnosisOverview
  return <div aria-label="分组诊断结果">
    {overview && <>
      <p>共 {overview.total} 组 · 完整交付 {overview.completed} 组 · 未完整交付 {overview.partial} 组</p>
      <MarkdownReport content={overview.text} />
    </>}
    {cases.slice(0, visible).map(item => <details open key={item.group_id} className={styles.caseCard}>
      <summary>
        <strong>{item.target?.entities?.map(e => `${e.namespace || ''}/${e.name}`).join('、') || item.group_id}</strong>
        <span>{item.execution_status === 'completed' ? '诊断已交付' : '诊断未完整交付'}</span>
        <p>{item.summary}</p>
      </summary>
      <MarkdownReport content={item.report || '本组尚无完整报告。'} />
    </details>)}
    {visible < cases.length && <button type="button" onClick={() => setVisible(n => n + 10)}>
      显示更多（已展示 {visible}/{cases.length}）
    </button>}
    {message.diagnosisFooter && <MarkdownReport content={message.diagnosisFooter} />}
  </div>
}
