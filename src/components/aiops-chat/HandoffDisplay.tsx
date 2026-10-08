import { useState } from 'react'
import MarkdownReport from './MarkdownReport'
import { isLegacyHandoff } from './handoffPresentation'
import { parseHandoff, type HandoffKV } from './handoffParsing'
import styles from './MessageList.module.css'
import CodeBlock from './CodeBlock'

export default function HandoffDisplay({ text }: { text: string }) {
  if (!isLegacyHandoff(text)) {
    return <div className={styles.nodeHandoff}><MarkdownReport content={text} /></div>
  }
  const pairs = parseHandoff(text)
  if (pairs.length === 0) {
    return <div className={styles.nodeHandoff}>{text}</div>
  }

  return (
    <div className={styles.handoffKvList}>
      {pairs.map((p, i) => (
        <HandoffKVItem key={i} kv={p} />
      ))}
    </div>
  )
}

function HandoffKVItem({ kv }: { kv: HandoffKV }) {
  const [expanded, setExpanded] = useState(false)
  const shortValue = kv.value.length > 120 ? kv.value.slice(0, 120) + '…' : kv.value

  return (
    <div className={styles.handoffKvItem}>
      <span className={styles.handoffKey}>{kv.key}</span>
      {kv.isJson ? (
        <div>
          <CodeBlock text={expanded ? kv.value : shortValue} copyText={kv.value} language="json" label={kv.key} />
          {kv.value.length > 120 && (
            <button type="button" aria-expanded={expanded}
              className={styles.handoffExpand}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '收起 ▲' : '展开 ▼'}
            </button>
          )}
        </div>
      ) : (
        <div className={styles.handoffValue}>{expanded ? kv.value : shortValue}
          {kv.value.length > 120 && <button type="button" className={styles.handoffExpand} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开全文'}</button>}
        </div>
      )}
    </div>
  )
}
