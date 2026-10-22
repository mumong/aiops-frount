import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkChineseStrong from './remarkChineseStrong'
import remarkLineBreaks from './remarkLineBreaks'
import { isValidElement, memo } from 'react'
import CodeBlock from './CodeBlock'
import styles from './MessageList.module.css'

interface MarkdownReportProps {
  content: string
}

// Module-level so memoized renders never hand react-markdown new plugin/component identities.
const REMARK_PLUGINS = [remarkGfm, remarkChineseStrong, remarkLineBreaks]
const COMPONENTS: Components = {
  table: ({ children }) => (
    <div className={styles.tableWrapper}>
      <table>{children}</table>
    </div>
  ),
  code: ({ className, children, ...props }) => {
    return <code className={className || styles.inlineCode} {...props}>{children}</code>
  },
  pre: ({ children }) => {
    const language = isValidElement<{ className?: string }>(children)
      ? /language-([\w-]+)/.exec(children.props.className || '')?.[1] : undefined
    return <CodeBlock language={language} label={language || '代码'}>{children}</CodeBlock>
  },
  h1: ({ children }) => <h2 className={styles.mdH2}>{children}</h2>,
  h2: ({ children }) => <h3 className={styles.mdH3}>{children}</h3>,
  h3: ({ children }) => <h4 className={styles.mdH4}>{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className={styles.mdBlockquote}>{children}</blockquote>
  ),
}

function MarkdownReport({ content }: MarkdownReportProps) {
  return (
    <div className={styles.markdownReport}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownReport)
