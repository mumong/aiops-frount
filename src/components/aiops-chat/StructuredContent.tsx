import { useMemo, useState } from 'react'
import MarkdownReport from './MarkdownReport'
import CodeBlock from './CodeBlock'
import CopyButton from './CopyButton'
import { splitStructuredContent, visibleModelAnalysis, readableStructuredAnalysis } from './structuredPresentation'
import styles from './StructuredContent.module.css'

export default function StructuredContent({ text, analysis = false }: { text: string; analysis?: boolean }) {
  const parts = useMemo(() => splitStructuredContent(analysis ? visibleModelAnalysis(text) : text), [text, analysis])
  return <>{parts.map((part, index) => part.kind === 'text'
    ? <MarkdownReport key={index} content={part.raw} />
    : <div key={index}>
      {analysis && part.kind === 'json' && <MarkdownReport content={readableStructuredAnalysis(part.value)} />}
      <details className={styles.detail}>
      <summary>{part.kind === 'json' ? 'JSON 数据（展开查看）' : '内部上下文 / 未完整解析的数据'}</summary>
      {part.kind === 'json' && <CopyButton text={part.raw} label="复制原文" />}
      {part.kind === 'json' ? <JsonBranch value={part.value} name="$" />
        : <CodeBlock text={part.raw} label="原始内容" />}
    </details></div>)}</>
}

function JsonBranch({ value, name }: { value: unknown; name: string }) {
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(50)
  if (value === null || typeof value !== 'object') {
    return <div className={styles.leaf}><span className={styles.key}>{name}: </span>
      <span className={typeof value === 'string' ? styles.string : styles.literal}>{JSON.stringify(value)}</span></div>
  }
  const entries = Object.entries(value)
  return <details className={styles.branch} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className={styles.key}>{name}</span> {Array.isArray(value) ? `[${entries.length} 项]` : `{${entries.length} 个字段}`}</summary>
    {open && <div className={styles.children}>
      {entries.slice(0, limit).map(([key, child]) => <JsonBranch key={key} value={child} name={key} />)}
      {entries.length > limit && <button type="button" onClick={() => setLimit(limit + 50)}>再显示 50 项（剩余 {entries.length - limit}）</button>}
    </div>}
  </details>
}
