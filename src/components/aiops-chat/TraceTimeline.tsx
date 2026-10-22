import { memo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CircleX, LoaderCircle } from 'lucide-react'
import ReasoningDetails from './ReasoningDetails'
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

/**
 * A stage's run: tool calls and the model's delivered text in the order they happened.
 * Raw reasoning is a draft; like the quick query it sits in one collapsed box above.
 */
function TraceTimeline({ steps, tool, live = false, reasoning = '' }: {
  steps: TraceStep[]
  tool: (id: string) => TraceTool | undefined
  live?: boolean
  /** Raw reasoning: shown once, collapsed, apart from tools and delivered text (as in the quick query). */
  reasoning?: string
}) {
  const visible = steps.filter(step => step.kind === 'tool' || (step.kind === 'text' && stepText(step)))
  const draft = reasoning.trim()
  return (
    <>
      {draft && <ReasoningDetails text={draft} live={live} />}
      {visible.length === 0
        ? <div className={styles.empty}>{live ? '模型分析中，工具调用和结论会显示在这里…' : '本阶段没有工具调用或分析输出。'}</div>
        : <ol className={styles.rail}>
      {visible.map((step, index) => {
        const previous = visible[index - 1]
        const stageChanged = step.stage && previous && previous.stage !== step.stage
        return (
          <li key={index} className={styles.item} data-kind={step.kind}>
            {stageChanged && <div className={styles.stage}>{STAGE_LABELS[step.stage!] || step.stage}</div>}
            {step.kind === 'tool'
              ? <ToolStep call={tool(step.toolId || '')} />
              : <div className={styles.text}><StructuredContent text={stepText(step)} analysis /></div>}
          </li>
        )
      })}
    </ol>}
    </>
  )
}

export default memo(TraceTimeline)

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
