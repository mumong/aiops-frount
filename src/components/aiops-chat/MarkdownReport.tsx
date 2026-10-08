import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { isValidElement } from 'react'
import CodeBlock from './CodeBlock'
import styles from './MessageList.module.css'

interface MarkdownReportProps {
  content: string
}

export default function MarkdownReport({ content }: MarkdownReportProps) {
  return (
    <div className={styles.markdownReport}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
