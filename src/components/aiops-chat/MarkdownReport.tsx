import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !className
            if (isInline) {
              return <code className={styles.inlineCode} {...props}>{children}</code>
            }
            return (
              <pre className={styles.codeBlock}>
                {match && <div className={styles.codeLang}>{match[1]}</div>}
                <code className={className} {...props}>{children}</code>
              </pre>
            )
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
