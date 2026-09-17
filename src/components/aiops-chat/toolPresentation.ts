/** Present observations, never infer a diagnosis or an unknown metric unit. */
export function presentToolEvent(data: Record<string, unknown>) {
  const args = (data.tool_args || {}) as Record<string, unknown>
  const display = data.tool_display as Record<string, unknown> | undefined
  if (!display) return { preview: String(data.result_preview || ''), detail: JSON.stringify(data, null, 2) }
  const rows = (display.measurements || []) as Record<string, unknown>[]
  const values = rows.slice(0, 3).map(row => {
    const value = String(row.value ?? '')
    const unit = String(row.unit || 'unknown')
    const numeric = Number(value)
    return `${row.name || '指标'}: ${value} ${unit === 'unknown' ? '(单位未标注，见表达式)' : unit}`
      + (unit === 'bytes' && value && Number.isFinite(numeric) ? ` ≈ ${(numeric / 1048576).toFixed(2)} MiB` : '')
  }).join('；')
  const empty = ['empty', 'absent'].includes(String(display.coverage))
  const outcome = data.status === 'error' ? '调用失败' : empty ? '请求成功 · 无匹配数据（不等于 0）' : values || String(display.coverage || '调用完成')
  const scope = [args.namespace, args.pod || args.name].filter(Boolean).join('/')
  const preview = [outcome, scope].filter(Boolean).join(' · ')
  const query = JSON.stringify(display.query || args, null, 2)
  const measurements = rows.length ? JSON.stringify(rows, null, 2) : '未返回可展示的数值事实'
  const detail = [
    `查询目的：${args.purpose || '见查询参数'}`,
    `查询参数\n${JSON.stringify(args, null, 2)}`,
    `结果状态：${outcome}`,
    `查询口径\n${query}`,
    `数值、时间及标签\n${measurements}`,
    `未展示事实数：${display.measurements_omitted || 0}`,
    `工具返回${display.result_excerpt_truncated ? '（仅前 12000 字符，已截断；不是完整原文）' : '（本次传递内容）'}\n${display.result_excerpt || ''}`,
    `完整原文归档引用：${display.raw_ref || '未提供'}`,
  ].join('\n\n')
  return { preview, detail }
}
