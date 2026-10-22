import { memo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CircleX, LoaderCircle } from 'lucide-react'
import MarkdownReport from './MarkdownReport'
import StructuredContent from './StructuredContent'
import { stepText } from './traceModel'
import type { TraceStep } from './types'
import styles from './TraceTimeline.module.css'

export interface TraceTool {
  toolName: string
  status: 'running' | 'success' | 'error'
  resultPreview?: string
  resultData?: string
}

const STAGE_LABELS: Record<string, string> = { evidence: '取证', rca: '根因分析', layer: '定位' }
// Long thoughts stay compact; the full text is one click away.
const THOUGHT_PREVIEW = 220

/**
 * The agent's run as one rail: reasoning, visible text and tool calls in the order
 * they happened (agent "chain of thought" pattern), so a reader sees what was
 * concluded from each result and which call followed.
 */
function TraceTimeline({ steps, tool, live = false }: {
  steps: TraceStep[]
  tool: (id: string) => TraceTool | undefined
  live?: boolean
}) {
  const visible = steps.filter(step => step.kind === 'tool' || stepText(step))
  if (visible.length === 0) {
    return <div className={styles.empty}>{live ? '等待模型的第一步…' : '本阶段没有记录到过程。'}</div>
  }
  return (
    <ol className={styles.rail}>
      {visible.map((step, index) => {
        const previous = visible[index - 1]
        const stageChanged = step.stage && previous && previous.stage !== step.stage
        const isLast = index === visible.length - 1
        return (
          <li key={index} className={styles.item} data-kind={step.kind}>
            {stageChanged && <div className={styles.stage}>{STAGE_LABELS[step.stage!] || step.stage}</div>}
            {step.kind === 'tool'
              ? <ToolStep call={tool(step.toolId || '')} />
              : step.kind === 'thought'
                ? <Thought text={stepText(step)} live={live && isLast} />
                : <div className={styles.text}><StructuredContent text={stepText(step)} analysis /></div>}
          </li>
        )
      })}
    </ol>
  )
}

export default memo(TraceTimeline)

function Thought({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false)
  const long = text.length > THOUGHT_PREVIEW
  // While streaming, show the newest part so the line tracks the model without growing.
  const shown = open || !long ? text : live ? `…${text.slice(-THOUGHT_PREVIEW)}` : `${text.slice(0, THOUGHT_PREVIEW)}…`
  return (
    <div className={styles.thought}>
      <span className={styles.label}>思考{live ? ' · 进行中' : ''}</span>
      <div className={styles.thoughtText}><MarkdownReport content={shown} /></div>
      {long && (
        <button type="button" className={styles.more} onClick={() => setOpen(!open)}>
          {open ? '收起' : `展开全部（${text.length} 字）`}
        </button>
      )}
    </div>
  )
}

function ToolStep({ call }: { call?: TraceTool }) {
  const [open, setOpen] = useState(false)
  if (!call) return null
  const detail = call.status !== 'running' && (call.resultData || call.resultPreview)
  return (
    <div className={`${styles.tool} ${call.status === 'error' ? styles.toolError : ''}`}>
      <button type="button" className={styles.toolHead} aria-expanded={detail ? open : undefined}
        disabled={!detail} onClick={() => setOpen(!open)}>
        <span className={styles.toolIcon}>
          {call.status === 'running' ? <LoaderCircle size={13} className={styles.spin} aria-label="执行中" />
            : call.status === 'success' ? <CheckCircle2 size={13} aria-label="成功" /> : <CircleX size={13} aria-label="失败" />}
        </span>
        <code className={styles.toolName}>{call.toolName}</code>
        {call.resultPreview && <span className={styles.toolPreview}>{call.resultPreview}</span>}
        {detail && <span className={styles.chevron}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
      </button>
      {open && detail && (
        <div className={styles.toolBody}><StructuredContent text={call.resultData || call.resultPreview || ''} /></div>
      )}
    </div>
  )
}
