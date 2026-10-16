import { useEffect, useRef, useState } from 'react'
import CodeBlock from './CodeBlock'
import MarkdownReport from './MarkdownReport'
import RepairPlanContent from './RepairPlanContent'
import RepairPolicyPanel from './RepairPolicyPanel'
import { describeObservation, describeRecoveryOutcome, describeRecoveryProgress } from './repairRecoveryPresentation'
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
  const [pendingText, setPendingText] = useState('')
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [now, setNow] = useState(Date.now)
  const [clockOffset, setClockOffset] = useState(0)
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
  const approvalKey = shown?.approval ? `${shown.job_id}:${shown.approval.approval_id}` : ''
  const serverDecision = shown?.approval?.decision_status
  const decisionText = serverDecision === 'approved' ? '已批准，等待后端执行。'
    : serverDecision === 'rejected' ? '已拒绝，等待状态更新。'
    : decisions[approvalKey]
  const remaining = shown?.approval ? Math.max(0, Math.ceil((shown.approval.expires_at * 1000 - now - clockOffset) / 1000)) : null
  useEffect(() => {
    if (!jobId || !shown?.status || !repairActive(shown.status)) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [jobId, shown?.status])

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
        if (!controller.signal.aborted) {
          if (result.server_time) setClockOffset(result.server_time * 1000 - Date.now())
          setJob(result)
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e))
      } finally {
        if (!controller.signal.aborted && keepPolling) timer = setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [apiBase, jobId, refresh])

  async function act(action: () => Promise<unknown>, label = '正在提交…') {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setPendingText(label)
    setError('')
    try { await action() }
    catch (e) { setError(String(e)) }
    finally { busy.current = false; setPending(false); setPendingText(''); setRefresh(v => v + 1) }
  }

  return <section className={styles.workspace} aria-label="分组修复方案">
    <header><strong>修复方案</strong></header>
    <RepairPolicyPanel apiBase={apiBase} />
    {!batchId && <button type="button" disabled={pending} onClick={() => void act(async () => {
      const result = await repairRequest<RepairBatch>(apiBase, '/repair/batches', { diagnosis_run_id: diagnosisId })
      // Backend work continues, but a closed/deleted panel must not recreate history.
      if (!mounted.current) return
      setBatch(result)
      onCreated(result.batch_id)
    })}>{pending ? '正在创建…' : '生成自动修复方案'}</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {pending && <p role="status" aria-live="polite">{pendingText}</p>}
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
        {shown.diagnosis_summary && <p className={styles.cause}><span>异常原因（来自诊断）</span>{shown.diagnosis_summary}</p>}
        <p>{shown.plan?.planning_error ? '规划未完成' : shown.status === 'planning' && shown.feedback ? '正在根据你的意见更新…' : repairStatus[shown.status] || shown.status}{shown.plan?.actions?.length ? shown.mode === 'auto' ? ` · 自动执行（未经人工审批${shown.mode_source === 'runtime' ? '，运行时开关' : '，配置'}）` : shown.mode === 'review' ? ' · 执行前需批准' : '' : ''}</p>
        {repairActive(shown.status) && shown.status_started_at && <small>
          本阶段已等待 {Math.max(0, Math.floor((now + clockOffset) / 1000 - shown.status_started_at))} 秒
          {['queued', 'planning'].includes(shown.status) ? ' · 正在处理，无需重复提交' : ''}
        </small>}
        {shown.error && shown.error !== shown.plan?.planning_error?.message && <p role="alert">{shown.error}</p>}
        {shown.plan && <RepairPlanContent plan={shown.plan} />}
        {shown.approval && shown.status === 'awaiting_approval' && <div className={styles.action}>
          <strong>等待批准</strong>
          <small> · {remaining === 0 ? '审批已到期，正在核对状态' : `剩余 ${remaining} 秒`} · 截止 {new Date(shown.approval.expires_at * 1000).toLocaleTimeString()}</small>
          {decisionText && <p role="status" aria-live="polite">{decisionText}</p>}
          <div className={styles.buttons}>{[true, false].map(approved => <button key={String(approved)} type="button"
            disabled={pending || !!decisionText || !onApprove || remaining === 0 || serverDecision === 'expired' || serverDecision === 'unavailable'}
            onClick={() => void act(async () => {
              try {
                await onApprove!(shown.job_id, shown.approval!.approval_id, approved)
                setDecisions(previous => ({ ...previous, [approvalKey]: approved ? '已批准，等待后端执行。' : '已拒绝，等待状态更新。' }))
              } catch {
                setDecisions(previous => ({ ...previous, [approvalKey]: '提交结果待确认，正在核对后端状态；不会重复提交。' }))
              }
            }, approved ? '正在提交批准，请勿重复点击…' : '正在提交拒绝…')}>{approved ? '批准此动作' : '拒绝此动作'}</button>)}</div>
        </div>}
        {shown.events?.filter(e => e.type === 'remediation_tool_result').map((e, i) => {
          const started = shown.events?.find(s => s.type === 'remediation_tool_start' && s.action_id === e.action_id && s.stage === e.stage)
          const authority = started?.approval === 'auto' ? '自动执行 · 未经人工审批' : started?.approval ? `审批 ID ${started.approval}` : ''
          return <details key={i} data-denied={e.error_code === 'repair_command_denied'}>
            <summary>{e.action_id} · {e.stage} · {e.error_code === 'repair_command_denied' ? `被安全规则拦截（${e.rule || '策略'}），未执行` : e.status === 'success' ? '命令成功' : '执行失败'}{authority ? ` · ${authority}` : ''}</summary>
            <CodeBlock text={e.command} language="bash" label={e.execution_skipped ? '被拦截的命令（未执行）' : '实际执行命令'} />
            <CodeBlock text={e.result_preview || '命令未返回正文'} label={e.execution_skipped ? '拦截原因' : '执行输出'} />
            {e.result_truncated && <p>仅展示部分输出。</p>}
          </details>
        })}
        {shown.status === 'verifying' && shown.recovery && <p role="status" aria-live="polite" className={styles.recoveryProgress}>{describeRecoveryProgress(shown.recovery)}</p>}
        {shown.result?.recovery && (() => {
          const outcome = describeRecoveryOutcome(shown.result.recovery!)
          return <section className={styles.recovery} data-tone={outcome.tone} aria-label="执行后恢复观察">
            <strong>{outcome.icon} {outcome.label}</strong>
            <table>
              <thead><tr><th>对象</th><th>执行前</th><th>执行后</th><th>耗时</th></tr></thead>
              <tbody>{shown.result.recovery.targets.map(t => <tr key={t.group_id}>
                <td>{t.group_id}</td><td>{describeObservation(t.before)}</td><td>{describeObservation(t.after)}</td>
                <td>{t.elapsed_seconds} 秒{t.timed_out ? ' · 超时' : ''}</td></tr>)}</tbody>
            </table>
            {shown.result.recovery.targets.map(t => <small key={t.group_id}>{t.reason}</small>)}
          </section>
        })()}
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
          {shown.plan?.planning_error && <button type="button" disabled={pending}
            onClick={() => void act(async () => {
              const next = await repairRequest<Pick<RepairJob, 'job_id' | 'group_id' | 'version'>>(apiBase,
                `/repair/jobs/${shown.job_id}/feedback`, { version: shown.version,
                  feedback: '请重新生成本组修复方案，复用已有诊断并按需核实最新状态。' })
              setBatch(previous => previous && ({ ...previous, groups: previous.groups.map(group =>
                group.job_id === shown.job_id ? { ...group, ...next, status: 'queued' } : group) }))
              setJob(undefined)
            }, '正在重新生成本组方案…')}>重新生成本组方案</button>}
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
