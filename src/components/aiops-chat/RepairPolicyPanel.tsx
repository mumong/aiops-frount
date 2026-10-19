import { useCallback, useEffect, useState } from 'react'
import { fetchRepairPolicy } from './repairPolicyApi'
import type { RepairPolicy } from './repairPolicyApi'
import { describeMode, summarizeRules } from './repairPolicyPresentation'
import styles from './RepairWorkspace.module.css'

/**
 * Safety posture of the repair executor, visible where repairs are started:
 * the current review/auto mode and the active high-risk command rules.
 * Mode switching and dry command checks stay available through the API
 * (PUT/DELETE /repair/policy/mode, POST /repair/policy/check).
 */
export default function RepairPolicyPanel({ apiBase }: { apiBase: string }) {
  const [policy, setPolicy] = useState<RepairPolicy>()
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)

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
  </div>
}
