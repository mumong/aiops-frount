import { isValidElement, useMemo, useRef, type ReactNode } from 'react'
import { Terminal } from 'lucide-react'
import CopyButton from './CopyButton'
import styles from './ContentTools.module.css'
import { highlightCode } from './codeHighlight'

export default function CodeBlock({ children, text, copyText, language, label = '输出', className = '' }: {
  children?: ReactNode
  text?: string
  copyText?: string
  language?: string
  label?: string
  className?: string
}) {
  const codeRef = useRef<HTMLPreElement>(null)
  const childText = isValidElement<{ children?: ReactNode }>(children) ? children.props.children : undefined
  const source = text ?? (typeof childText === 'string' ? childText : undefined)
  const highlighted = useMemo(() => source === undefined ? undefined : highlightCode(source, language), [source, language])
  return <div className={`${styles.codePanel} ${className}`}>
    <div className={styles.codeToolbar}><span><Terminal size={13} />{label}</span>
      <CopyButton text={() => copyText ?? text ?? codeRef.current?.textContent ?? ''} label="复制内容" />
    </div>
    <pre ref={codeRef} tabIndex={0}>{highlighted !== undefined
      ? <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      : text !== undefined ? <code>{text}</code> : children}</pre>
  </div>
}
