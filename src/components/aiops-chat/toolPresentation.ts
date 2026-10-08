/** Present observations, never infer a diagnosis or an unknown metric unit. */
export function presentToolEvent(data: Record<string, unknown>) {
  const args = (data.tool_args || {}) as Record<string, unknown>
  const display = data.tool_display as Record<string, unknown> | undefined
  if (!display) return { preview: String(data.result_preview || ''), detail: JSON.stringify(data, null, 2) }
  const rows = (display.measurements || []) as Record<string, unknown>[]
  const values = rows.slice(0, 3).map(row => {
    const value = String(row.value ?? '')
    if (row.value_kind === 'text') return `${row.name || '文本结果'}: ${value}`
    const unit = String(row.unit || 'unknown')
    const numeric = Number(value)
    return `${row.name || '指标'}: ${value} ${unit === 'unknown' ? '(单位未标注，见表达式)' : unit}`
      + (unit === 'bytes' && value && Number.isFinite(numeric) ? ` ≈ ${(numeric / 1048576).toFixed(2)} MiB` : '')
  }).join('；')
  const empty = ['empty', 'absent'].includes(String(display.coverage))
  const failed = data.status === 'error' || data.semantic_success === false || display.coverage === 'error'
  const unparsed = display.parse_status === 'unsupported'
  const partial = display.parse_status === 'partial'
  const outcome = failed ? '调用失败或查询被拒绝'
    : empty ? '请求成功 · 无匹配数据（不等于 0）'
      : unparsed ? '结果格式暂未解析，请查看原文（不等于无数据）'
        : (values || '调用完成 · 详见原始返回') + (partial ? ' · 部分结果未解析' : '')
  const scope = [args.namespace, args.pod || args.name].filter(Boolean).join('/')
  const preview = [outcome, scope].filter(Boolean).join(' · ')
  const query = display.query || args
  const queryText = JSON.stringify(query, null, 2)
  const measurements = rows.length ? JSON.stringify(rows, null, 2)
    : failed ? '查询未成功，不能将结果视为 0'
      : empty ? '本次查询没有匹配数据，不代表数值为 0'
        : '未提取结构化数值，请查看原始返回；不代表工具没有数据'
  const rangeNote = display.result_type === 'matrix'
    || rows.some(row => row.point_policy === 'latest_per_series' || Number(row.sample_count) > 1)
    ? '区间结果：每条序列展示最新采样点及采样数，不是整个区间的平均值；完整序列见原文。' : ''
  const notices = [...(Array.isArray(display.warnings) ? display.warnings : []),
    ...(Array.isArray(display.infos) ? display.infos : [])].map(String)
  const detail = [
    ...(args.purpose ? [`查询目的：${args.purpose}`] : []),
    `结果状态：${outcome}`,
    `查询参数\n${JSON.stringify(args, null, 2)}`,
    ...(JSON.stringify(query) !== JSON.stringify(args) ? [`查询口径\n${queryText}`] : []),
    ...(display.series_count != null ? [`结果条目/序列数：${display.series_count}`] : []),
    ...(rangeNote ? [rangeNote] : []),
    `数值、时间及标签\n${measurements}`,
    ...(rows.length || display.measurements_omitted ? [`因展示上限未展开的条目数：${display.measurements_omitted || 0}`] : []),
    ...(display.unparsed_series ? [`未解析的序列数：${display.unparsed_series}`] : []),
    ...(notices.length ? [`数据源提示\n${notices.join('\n')}`] : []),
    `工具返回${display.result_excerpt_truncated ? '（仅前 12000 字符，已截断；不是完整原文）' : '（本次传递内容）'}\n${display.result_excerpt || ''}`,
    `完整原文归档引用：${display.raw_ref || '未提供'}`,
  ].join('\n\n')
  return { preview, detail }
}
