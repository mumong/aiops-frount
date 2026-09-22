export interface RoutePresentation {
  route: string
  title: string
  scope: string
  basis: string
  outputs: string[]
  steps: string[]
  errorMessage?: string
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string') : []

export function presentRoute(snapshot: unknown): RoutePresentation | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined
  const data = snapshot as Record<string, unknown>
  const route = String(data.request_route || '')
  const contract = (data.request_contract || {}) as Record<string, unknown>
  const failure = data.request_error && typeof data.request_error === 'object'
    ? data.request_error as Record<string, unknown> : {}
  const titles: Record<string, string> = {
    focused: '轻量查询与分析', full_diagnosis: '深度诊断',
    remediation: 'Pod 修复规划与审查',
    clarify: '需要补充信息', stop: '任务识别未完成',
  }
  if (!titles[route]) return undefined
  const scopes: Record<string, string> = {
    cluster: '集群', namespace: '命名空间', pod: '指定 Pod',
    unspecified: contract.task === 'explain' ? '通用说明' : '未指定资源范围',
  }
  const targets = [...strings(contract.namespaces), ...strings(contract.pod_names)]
  return {
    route, title: route === 'stop' && typeof failure.title === 'string' ? failure.title : titles[route],
    errorMessage: route === 'stop' && typeof failure.message === 'string' ? failure.message : undefined,
    scope: [scopes[String(contract.scope)] || '', targets.join(' / ')].filter(Boolean).join(' · '),
    basis: typeof contract.scope_basis === 'string' ? contract.scope_basis : '',
    outputs: strings(contract.requested_outputs),
    steps: route === 'full_diagnosis' ? ['layer', 'evidence', 'rca', 'conclusion']
      : route === 'focused' ? ['query_collect'] : route === 'remediation' ? ['remediation'] : [],
  }
}
