import { useEffect, useRef, useState } from 'react'
import CodeBlock from './CodeBlock'
import MarkdownReport from './MarkdownReport'
import RepairPlanContent from './RepairPlanContent'
import { repairActive, repairRequest, repairStatus } from './repairWorkspaceApi'
import type { RepairBatch, RepairJob } from './repairWorkspaceApi'
import styles from './RepairWorkspace.module.css'

interface Props {
  apiBase: string
  diagnosisId: string
  batchId?: string
  onCreated: (id: string) => void
  onApprove?: (runId: string, approvalId: string, approved: boolean) => Promise<unknown>
}

export default function RepairWorkspace({ apiBase, diagnosisId, batchId, onCreated, onApprove }: Props) {
  const [batch, setBatch] = useState<RepairBatch>()
  const [selected, setSelected] = useState('')
  const [job, setJob] = useState<RepairJob>()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const [refresh, setRefresh] = useState(0)
  const current = batch?.groups.find(g => g.group_id === selected) || batch?.groups[0]
  const jobId = current?.job_id
  const shown = job?.job_id === jobId ? job : undefined

  useEffect(() => {
    if (!batchId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      let keepPolling = true
      try {
        const result = await repairRequest<RepairBatch>(apiBase, `/repair/batches/${batchId}`, undefined, controller.signal)
        keepPolling = result.groups.some(g => repairActive(g.status))
        if (!controller.signal.aborted) setBatch(result)
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e))
      } finally {
        if (!controller.signal.aborted && keepPolling) timer = setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [apiBase, batchId, refresh])

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      let keepPolling = true
      try {
        const result = await repairRequest<RepairJob>(apiBase, `/repair/jobs/${jobId}`, undefined, controller.signal)
        keepPolling = repairActive(result.status)
        if (!controller.signal.aborted) setJob(result)
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e))
      } finally {
        if (!controller.signal.aborted && keepPolling) timer = setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [apiBase, jobId, refresh])

  async function act(action: () => Promise<unknown>) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try { await action(); setRefresh(v => v + 1) }
    catch (e) { setError(String(e)) }
    finally { busy.current = false; setPending(false) }
  }

  return <section className={styles.workspace} aria-label="分组修复方案">
    <header><strong>修复方案</strong></header>
    {!batchId && <button type="button" disabled={pending} onClick={() => void act(async () => {
      const result = await repairRequest<RepairBatch>(apiBase, '/repair/batches', { diagnosis_run_id: diagnosisId })
      // Backend work continues, but a closed/deleted panel must not recreate history.
      if (!mounted.current) return
      setBatch(result)
      onCreated(result.batch_id)
    })}>{pending ? '正在创建…' : '生成自动修复方案'}</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {batchId && !batch && <p role="status">正在读取修复任务…</p>}
    {batch && <>
      {batch.groups.length > 1 && <div className={styles.cards} role="group" aria-label="选择修复组">
        {batch.groups.map(group => <button type="button" key={group.group_id}
          aria-pressed={group.job_id === jobId} onClick={() => setSelected(group.group_id)}>
          <strong>{group.target?.label || group.group_id}</strong>
          <span>{group.target?.entities?.map(e => `${e.namespace || ''}/${e.name || ''}`).join('、')}</span>
          <span>v{group.version} · {repairStatus[group.status] || group.status}</span>
        </button>)}
      </div>}
      {!shown ? <p role="status">正在读取本组方案…</p> : <div className={styles.detail}>
        {shown.feedback && <article className={styles.humanFeedback} aria-label="你的修改意见">
          <strong>你的修改意见 · 针对 v{shown.feedback.source_version}</strong>
          <p>{shown.feedback.text}</p>
          <small>已提交，用于生成 v{shown.feedback.target_version} · 不代表批准执行</small>
        </article>}
        <details>
          <summary>规划说明与任务详情</summary>
          <small>运行 ID：{shown.job_id}</small>
          <p>关闭页面不会停止任务。修改仅影响当前方案，新版本重新审批；已执行动作不会回滚。</p>
          <p>以下为规划时的记录，不代表命令已经执行。</p>
          {shown.plan?.answer && <MarkdownReport content={shown.plan.answer} />}
        </details>
        <h4 className={styles.aiHeading}>{batch.groups.length > 1 ? `${current?.target?.label || shown.group_id} · ` : ''}AI 修复方案 · v{shown.version}</h4>
        <p>{shown.status === 'planning' && shown.feedback ? '正在根据你的意见更新…' : repairStatus[shown.status] || shown.status}{shown.mode === 'auto' ? ' · 自动执行' : shown.mode === 'review' ? ' · 执行前需批准' : ''}</p>
        {shown.error && <p role="alert">{shown.error}</p>}
        {shown.plan && <RepairPlanContent plan={shown.plan} />}
        {shown.approval && shown.status === 'awaiting_approval' && <div className={styles.action}>
          <strong>等待批准</strong>
          <small> · 有效期至 {new Date(shown.approval.expires_at * 1000).toLocaleTimeString()}</small>
          <div className={styles.buttons}>{[true, false].map(approved => <button key={String(approved)} type="button"
            disabled={pending || !onApprove || shown.approval!.expires_at * 1000 <= Date.now()}
            onClick={() => void act(async () => {
              await onApprove!(shown.job_id, shown.approval!.approval_id, approved)
              setJob(previous => previous?.job_id === shown.job_id ? { ...previous, approval: undefined } : previous)
            })}>{approved ? '批准此动作' : '拒绝此动作'}</button>)}</div>
        </div>}
        {shown.events?.filter(e => e.type === 'remediation_tool_result').map((e, i) => <details key={i}>
          <summary>{e.action_id} · {e.stage} · {e.status === 'success' ? '命令成功' : '执行失败'}</summary>
          <CodeBlock text={e.command} language="bash" label="实际执行命令" />
          <CodeBlock text={e.result_preview || '命令未返回正文'} label="执行输出" />
          {e.result_truncated && <p>仅展示部分输出。</p>}
        </details>)}
        {shown.result?.reason && !!shown.plan?.actions?.length && <p role="status">{shown.result.reason}</p>}
        {!!shown.history?.length && <details className={styles.history}>
          <summary>修改记录 · {shown.history.length} 个历史版本</summary>
          {shown.history.map(entry => <details key={entry.job_id}>
            <summary>AI 历史方案 · v{entry.version}（非当前执行版本）</summary>
            {entry.feedback && <article className={styles.humanFeedback}>
              <strong>你的修改意见 · 针对 v{entry.feedback.source_version}</strong><p>{entry.feedback.text}</p>
            </article>}
            {entry.plan ? <RepairPlanContent plan={entry.plan} /> : <p>此版本未生成方案。</p>}
          </details>)}
        </details>}
        <label className={styles.feedback}>{batch.groups.length > 1 ? '本组修改意见' : '补充信息或修改意见'}
          <textarea value={drafts[shown.job_id] || ''} maxLength={8000}
            placeholder="填写事实依据或修改要求，再点击下方按钮提交"
            onChange={e => setDrafts(previous => ({ ...previous, [shown.job_id]: e.target.value }))} />
        </label>
        <div className={styles.buttons}>
          <button type="button" disabled={pending || !drafts[shown.job_id]?.trim()
            || ['queued', 'planning', 'executing', 'superseded'].includes(shown.status)}
            onClick={() => void act(async () => {
              const text = drafts[shown.job_id]?.trim() || ''
              if (!text.trim()) return
              const next = await repairRequest<Pick<RepairJob, 'job_id' | 'group_id' | 'version'>>(apiBase, `/repair/jobs/${shown.job_id}/feedback`, { version: shown.version, feedback: text })
              setBatch(previous => previous && ({ ...previous, groups: previous.groups.map(group =>
                group.job_id === shown.job_id ? { ...group, ...next, status: 'queued' } : group) }))
              setJob(undefined)
            })}>{pending ? '正在提交…' : '提交意见并重新生成'}</button>
          {repairActive(shown.status) && <button type="button" disabled={pending} onClick={() => void act(async () => {
            await repairRequest(apiBase, `/repair/jobs/${shown.job_id}/cancel`, {})
          })}>停止本组后续操作</button>}
        </div>
        {['queued', 'planning'].includes(shown.status) && <small>方案生成后可提交修改意见。</small>}
      </div>}
    </>}
  </section>
}
