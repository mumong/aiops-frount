import type { CommandVerdict, RepairPolicy } from './repairPolicyApi'

export interface ModePresentation {
  label: string
  tone: 'review' | 'auto' | 'off'
  detail: string
}

/** What the switch currently means for the next repair job, in reviewer terms. */
export function describeMode(policy: Pick<RepairPolicy, 'enabled' | 'mode' | 'mode_source' | 'override' | 'approval_timeout_seconds'>, nowMs = Date.now()): ModePresentation {
  if (!policy.enabled) return { label: '修复执行已关闭', tone: 'off', detail: '配置 workflow.remediation.enabled=false，方案只生成不执行' }
  const auto = policy.mode === 'auto'
  const parts: string[] = []
  if (policy.mode_source === 'runtime' && policy.override) {
    const remaining = policy.override.expires_at ? Math.max(0, Math.ceil((policy.override.expires_at * 1000 - nowMs) / 60000)) : null
    parts.push('运行时覆盖')
    if (remaining !== null) parts.push(`剩余 ${remaining} 分钟后回到配置值`)
    if (policy.override.changed_by) parts.push(`由 ${policy.override.changed_by} 设置`)
    if (policy.override.reason) parts.push(`原因：${policy.override.reason}`)
  } else {
    parts.push('来自配置')
  }
  parts.push(auto ? '每个动作直接执行，不等待人工批准' : `每个动作先审批，${policy.approval_timeout_seconds} 秒内未批准则取消`)
  return { label: auto ? '自动执行' : '人工审批', tone: auto ? 'auto' : 'review', detail: parts.join(' · ') }
}

/** One line a tester can read: the two blacklists, as the server enforces them. */
export function summarizeRules(rules: RepairPolicy['rules']): string {
  const k = rules.kubernetes
  const kube = [`${k.commands.length} 个命令`, `${k.resources.length} 类集群资源`]
  if (k.batch.length) kube.push('批量操作')
  return `Kubernetes：${kube.join('、')} · Shell：${rules.shell.length} 个命令`
}

export const RULE_LABELS: Record<string, string> = {
  'transport.kubectl_only': '只允许单条 kubectl',
  'transport.no_shell_operators': '禁止管道/重定向/组合',
  'transport.no_identity_override': '禁止切换集群或身份',
  denied_operations: '高危动词黑名单',
  allowed_operations: '动词白名单',
  denied_flags: '强制/批量参数黑名单',
  bulk_selector_on_write: '禁止选择器批量写',
  denied_resource_kinds: '集群级/安全资源黑名单',
  denied_executables: '容器内命令黑名单',
  allowed_exec_commands: '容器内命令白名单',
}

export function describeVerdict(verdict: CommandVerdict): { icon: string; label: string; detail: string } {
  if (verdict.allowed) return { icon: '✅', label: `允许（${verdict.operation || '操作'}）`, detail: '通过全部规则；执行前仍按当前模式审批' }
  const rule = RULE_LABELS[verdict.rule] || verdict.rule || '策略'
  return { icon: '⛔', label: `拦截 · ${rule}`, detail: verdict.reason }
}

/** Split a pasted block into candidate commands (one per line, blanks and comments dropped). */
export function splitCommands(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).slice(0, 50)
}
