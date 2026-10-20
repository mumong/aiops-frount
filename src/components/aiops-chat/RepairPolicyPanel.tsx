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
        <dt>Kubernetes</dt>
        <dd>
          禁止命令：{policy.rules.kubernetes.commands.join(', ') || '无'}<br />
          禁止修改的集群资源：{policy.rules.kubernetes.resources.join(', ') || '无'}<br />
          禁止批量操作：{policy.rules.kubernetes.batch.join(', ') || '无'}
        </dd>
        <dt>Shell</dt>
        <dd>禁止命令：{policy.rules.shell.join(', ') || '无'}（Pod 内执行与 bash 工具均适用）</dd>
      </dl>
      <small>规划方案、执行修复和对话执行使用同一套规则；命中任一条即拦截，不执行。</small>
    </details>
  </div>
}
