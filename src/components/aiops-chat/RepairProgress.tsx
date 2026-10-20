import { CheckCircle2, CircleAlert } from 'lucide-react'
import ReasoningDetails from './ReasoningDetails'
import { repairStatus } from './repairWorkspaceApi'
import type { PlanningProgress } from './repairWorkspaceApi'
import styles from './RepairWorkspace.module.css'

const STAGES = ['规划', '审批', '执行', '恢复观察', '结果'] as const

/** Where a repair job is in plan → approve → execute → observe → result. */
function stageIndex(status: string): number {
  if (['queued', 'planning'].includes(status)) return 0
  if (['planned', 'awaiting_approval'].includes(status)) return 1
  if (status === 'executing') return 2
  if (['verifying', 'needs_followup'].includes(status)) return 3
  return 4
}

export default function RepairProgress({ progress, status, mode }: {
  progress?: PlanningProgress
  status: string
  mode?: string
}) {
  const current = stageIndex(status)
  const tools = progress?.tools || []
  const failed = tools.filter(tool => tool.status === 'error').length
  const planning = current === 0
  return <>
    <ol className={styles.stages} aria-label="修复进度">
      {STAGES.map((stage, index) => <li key={stage}
        className={index < current ? styles.stageDone : index === current ? styles.stageCurrent : ''}
        aria-current={index === current ? 'step' : undefined}>
        <span>{index + 1}</span>{stage === '审批' && mode === 'auto' ? '自动执行' : stage}
        {index === 4 && current === 4 && <small>{repairStatus[status] || status}</small>}
      </li>)}
    </ol>
    {planning && progress?.note && <p className={styles.progressNote} role="status">{progress.note}</p>}
    {(tools.length > 0 || progress?.reasoning) && <details open={planning} className={styles.progress} aria-label="规划过程">
      <summary>规划过程 · {tools.length} 次工具调用{failed ? ` · ${failed} 失败` : ''}{planning ? ' · 进行中' : ''}</summary>
      {progress?.reasoning && <ReasoningDetails text={progress.reasoning} live={planning} />}
      <ol className={styles.toolList}>
        {tools.map(tool => <li key={tool.id} className={tool.status === 'error' ? styles.toolError : ''}>
          <div className={styles.toolHead}>
            {tool.status === 'running' ? <span className={styles.toolRunning}>执行中</span>
              : tool.status === 'unfinished' ? <span className={styles.toolRunning}>未返回</span>
              : tool.status === 'success' ? <CheckCircle2 size={14} aria-label="成功" /> : <CircleAlert size={14} aria-label="失败" />}
            <code>{tool.name}</code>
            {typeof tool.duration_seconds === 'number' && <small>{tool.duration_seconds.toFixed(1)}s</small>}
          </div>
          {tool.args && <code className={styles.toolArgs}>{tool.args}</code>}
          {tool.preview && <details><summary>结果摘要</summary><pre>{tool.preview}</pre></details>}
        </li>)}
      </ol>
    </details>}
  </>
}
