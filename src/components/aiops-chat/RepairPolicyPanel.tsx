import { useCallback, useEffect, useState } from 'react'
import {
  ADMIN_TOKEN_STORAGE_KEY, checkRepairCommands, clearRepairMode, fetchRepairPolicy, setRepairMode,
} from './repairPolicyApi'
import type { CommandVerdict, RepairPolicy } from './repairPolicyApi'
import { describeMode, describeVerdict, splitCommands, summarizeRules } from './repairPolicyPresentation'
import styles from './RepairWorkspace.module.css'

function readToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '' } catch { return '' }
}

/**
 * Safety posture of the repair executor, visible where repairs are started:
 * the review/auto switch (with an admin-only toggle), the active high-risk
 * command rules, and a dry command check against the same rule engine.
 */
export default function RepairPolicyPanel({ apiBase }: { apiBase: string }) {
  const [policy, setPolicy] = useState<RepairPolicy>()
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)
  const [commands, setCommands] = useState('')
  const [verdicts, setVerdicts] = useState<CommandVerdict[]>()
  const [token, setToken] = useState(readToken)
  const [mode, setMode] = useState<'review' | 'auto'>('auto')
  const [ttl, setTtl] = useState(60)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await fetchRepairPolicy(apiBase, signal)
      setPolicy(value)
      setError('')
    } catch (e) {
      if (!signal?.aborted) setError(String(e))
    }
  }, [apiBase])

  useEffect(() => {
    const controller = new AbortController()
    const tick = () => { setNow(Date.now()); void load(controller.signal) }
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 30000)
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer) }
  }, [load])

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try { await action(); setNotice(done); await load() }
    catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  if (!policy) return <div className={styles.policy} role="status">{error ? `安全策略读取失败：${error}` : '正在读取修复安全策略…'}</div>
  const shown = describeMode(policy, now)
  return <div className={styles.policy} aria-label="修复安全策略">
    <div className={styles.policyRow}>
      <span>执行方式</span>
      <strong className={styles[`mode_${shown.tone}`]} data-mode={policy.mode}>{shown.label}</strong>
      <small>{shown.detail}</small>
    </div>
    <div className={styles.policyRow}>
      <span>高危命令拦截</span>
      <strong>已启用</strong>
      <small>{summarizeRules(policy.rules)}</small>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <details>
      <summary>查看拦截规则</summary>
      <dl className={styles.rules}>
        <dt>传输限制</dt><dd>{Object.values(policy.rules.transport).join('；')}</dd>
        <dt>禁止动词</dt><dd>{policy.rules.denied_operations.join(', ') || '无'}</dd>
        {policy.rules.allowed_operations.length > 0 && <><dt>仅允许动词</dt><dd>{policy.rules.allowed_operations.join(', ')}</dd></>}
        <dt>禁止参数</dt><dd>{policy.rules.denied_flags.join(', ') || '无'}{policy.rules.bulk_selector_on_write ? '；写操作禁止 -l/--selector/--field-selector 批量命中' : ''}</dd>
        <dt>禁止写入的资源</dt><dd>{policy.rules.denied_resource_kinds.join(', ') || '无'}</dd>
        <dt>容器内禁止命令</dt><dd>{policy.rules.denied_executables.join(', ') || '无'}{policy.rules.allowed_exec_commands.length ? `；仅允许：${policy.rules.allowed_exec_commands.join(', ')}` : ''}</dd>
      </dl>
    </details>
    <details>
      <summary>命令安全检查（不执行，只判定）</summary>
      <label className={styles.feedback}>每行一条 kubectl 命令
        <textarea value={commands} onChange={e => setCommands(e.target.value)} maxLength={8000}
          placeholder={'kubectl delete ns demo --force\nkubectl patch pod/x -n demo --type=merge -p \'{"metadata":{"finalizers":null}}\''} />
      </label>
      <div className={styles.buttons}>
        <button type="button" disabled={busy || !splitCommands(commands).length}
          onClick={() => void run(async () => { setVerdicts((await checkRepairCommands(apiBase, splitCommands(commands))).results) }, '已完成判定，命令未执行')}>检查</button>
      </div>
      {verdicts && <ul className={styles.verdicts} aria-label="判定结果">
        {verdicts.map((item, index) => {
          const view = describeVerdict(item)
          return <li key={index} data-allowed={item.allowed}>
            <code>{item.command}</code>
            <strong>{view.icon} {view.label}</strong>
            <small>{view.detail}</small>
          </li>
        })}
      </ul>}
    </details>
    <details>
      <summary>切换执行方式（管理员）</summary>
      {!policy.runtime_switch.available
        ? <p>{policy.runtime_switch.note}</p>
        : <div className={styles.switchForm}>
          <label>管理员令牌
            <input type="password" value={token} autoComplete="off" onChange={e => {
              setToken(e.target.value)
              try { sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, e.target.value) } catch { /* private mode */ }
            }} />
          </label>
          <label>切换为
            <select value={mode} onChange={e => setMode(e.target.value as 'review' | 'auto')}>
              <option value="auto">自动执行（跳过人工审批）</option>
              <option value="review">人工审批</option>
            </select>
          </label>
          <label>有效期（分钟）<input type="number" min={1} max={1440} value={ttl} onChange={e => setTtl(Number(e.target.value) || 60)} /></label>
          <label>原因<input type="text" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="例如：Sprint 2 自动执行开关验收" /></label>
          <div className={styles.buttons}>
            <button type="button" disabled={busy || !token}
              onClick={() => void run(() => setRepairMode(apiBase, token, { mode, reason, ttl_minutes: ttl, changed_by: 'frontend' }), '已切换；只影响之后创建的修复任务，正在等待审批的任务不受影响')}>应用</button>
            <button type="button" disabled={busy || !token || policy.mode_source !== 'runtime'}
              onClick={() => void run(() => clearRepairMode(apiBase, token), '已恢复为配置值')}>恢复配置值</button>
          </div>
          <small>切换会写入审计记录（/repair/audit）。到期自动回到配置值 {policy.config_mode === 'auto' ? '自动执行' : '人工审批'}。</small>
        </div>}
    </details>
  </div>
}
