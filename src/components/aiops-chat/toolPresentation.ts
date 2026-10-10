/** Preview priorities only: all original labels remain in the expanded detail. */
const SEMANTIC_LABELS = ['reason', 'condition', 'status', 'phase', 'resource', 'mode', 'code', 'le', 'quantile']
const IDENTITY_LABELS = ['pod', 'container', 'instance', 'endpoint', 'namespace', 'node', 'job', 'service']

function labelPreview(row: Record<string, unknown>) {
  const source = row.labels
  if (!source || typeof source !== 'object' || Array.isArray(source)) return ''
  const labels = Object.fromEntries(Object.entries(source).filter(([key, value]) =>
    key !== '__name__' && value !== undefined && value !== null && value !== ''))
  const present = (keys: string[]) => keys.filter(key => Object.prototype.hasOwnProperty.call(labels, key))
  const ordered = [...new Set([
    ...present(SEMANTIC_LABELS).slice(0, 2), ...present(IDENTITY_LABELS).slice(0, 4),
    ...present(SEMANTIC_LABELS), ...present(IDENTITY_LABELS), ...Object.keys(labels).sort(),
  ])]
  if (!ordered.length) return ''
  const shown = ordered.slice(0, 6).map(key => {
    const value = String(labels[key])
    return `${key}=${JSON.stringify(value.length > 72 ? value.slice(0, 72) + '…' : value)}`
  })
  if (ordered.length > shown.length) shown.push(`另 ${ordered.length - shown.length} 个标签`)
  return ` {${shown.join(', ')}}`
}

/** Present observations, never infer a diagnosis or an unknown metric unit. */
export function presentToolEvent(data: Record<string, unknown>) {
  const args = (data.tool_args || {}) as Record<string, unknown>
  const display = data.tool_display as Record<string, unknown> | undefined
  if (!display) return { preview: String(data.result_preview || ''), detail: JSON.stringify(data, null, 2) }
  if (display.contract_version === 'evidence-records.v1') return presentRecords(data, display, args)
  const rows = (display.measurements || []) as Record<string, unknown>[]
  const values = rows.slice(0, 3).map(row => {
    const value = String(row.value ?? '')
    const name = String(row.name || (row.value_kind === 'text' ? '文本结果' : '指标'))
    if (row.value_kind === 'text') return `${name}: ${value}${labelPreview(row)}`
    const unit = String(row.unit || 'unknown')
    const numeric = Number(value)
    return `${name}: ${value} ${unit === 'unknown' ? '(单位未标注，见表达式)' : unit}`
      + (unit === 'bytes' && value && Number.isFinite(numeric) ? ` ≈ ${(numeric / 1048576).toFixed(2)} MiB` : '')
      + labelPreview(row)
  }).join('\n')
  const unpreviewed = Math.max(0, rows.length - 3) + (Number(display.measurements_omitted) || 0)
  const empty = ['empty', 'absent'].includes(String(display.coverage))
  const failed = data.transport_status === 'error' || data.status === 'error'
    || data.semantic_success === false || display.coverage === 'error'
  const unparsed = display.parse_status === 'unsupported'
  const partial = display.parse_status === 'partial'
  const outcome = failed ? '调用失败或查询被拒绝'
    : empty ? '请求成功 · 无匹配数据（不等于 0）'
      : unparsed ? '结果格式暂未解析，请查看原文（不等于无数据）'
        : (values || '调用完成 · 详见原始返回')
          + (unpreviewed ? ` · 另有 ${unpreviewed} 条结果未在预览展示，详见展开内容及原文` : '')
          + (partial ? ' · 部分结果未解析' : '')
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
  const execution = data.transport_status || data.status
  const coverageLabels: Record<string, string> = {
    present: '有数据', empty: '无匹配数据（不等于 0）', absent: '无匹配数据（不等于 0）',
    partial: '部分覆盖', weak: '有限覆盖', unknown: '未知', error: '查询错误',
  }
  const parseLabels: Record<string, string> = {
    parsed: '已解析', partial: '部分解析', unsupported: '暂不支持解析', error: '源端错误',
  }
  const detail = [
    ...(args.purpose ? [`查询目的：${args.purpose}`] : []),
    `结果状态：${outcome}`,
    `执行状态：${execution === 'success' ? '成功' : execution === 'error' ? '失败' : '未提供'}`,
    `数据覆盖：${coverageLabels[String(display.coverage)] || '未提供'}`,
    `解析状态：${parseLabels[String(display.parse_status)] || '未提供'}`,
    `查询参数\n${JSON.stringify(args, null, 2)}`,
    ...(JSON.stringify(query) !== JSON.stringify(args) ? [`查询口径\n${queryText}`] : []),
    ...(display.series_count != null ? [`结果条目/序列数：${display.series_count}`] : []),
    ...(rangeNote ? [rangeNote] : []),
    ...(rows.some(row => row.value_kind !== 'text')
      ? ['解读提示：数值需结合指标、标签、表达式及时间；0/1 不自动等于健康或故障。预览缩略不修改下方标签和原始返回。'] : []),
    `数值、时间及标签\n${measurements}`,
    ...(rows.length || display.measurements_omitted ? [`因展示上限未展开的条目数：${display.measurements_omitted || 0}`] : []),
    ...(display.unparsed_series ? [`未解析的序列数：${display.unparsed_series}`] : []),
    ...(notices.length ? [`数据源提示\n${notices.join('\n')}`] : []),
    `工具返回${display.result_excerpt_truncated ? '（仅前 12000 字符，已截断；不是完整原文）' : '（本次传递内容）'}\n${display.result_excerpt || ''}`,
    `完整原文归档引用：${display.raw_ref || '未提供'}`,
  ].join('\n\n')
  return { preview, detail }
}

/** Record counts are not metric samples; source coverage is not selection coverage. */
function presentRecords(data: Record<string, unknown>, display: Record<string, unknown>, args: Record<string, unknown>) {
  const source = (display.source_metadata || {}) as Record<string, unknown>
  const failed = data.transport_status === 'error' || data.status === 'error'
    || data.semantic_success === false || display.semantic_success === false || display.execution_status === 'error'
  const parsed = display.parse_status === 'parsed'
  const unit = display.record_unit === 'container' ? '容器' : display.record_unit === 'pod' ? 'Pod' : '记录'
  const count = display.matched_rows ?? '未知'
  const unknown = display.unknown_filter_rows ?? '未知'
  const records = Array.isArray(display.records) ? display.records as Record<string, unknown>[] : []
  const groups = display.result_type === 'groups'
  const query = (display.query || args) as Record<string, unknown>
  const groupField = String(query.group_by || '')
  const sample = groups && groupField ? records.slice(0, 3).map(row =>
    `${row[groupField] === null ? '未知' : String(row[groupField])}: ${row.count} ${unit}`).join('；') : ''
  const outcome = failed ? '查询未成功' : !parsed ? '结果暂未解析'
    : `匹配 ${count} 条${unit}记录 · 条件未知 ${unknown} 条`
  const coverage = source.coverage === 'partial' ? '部分页；不能代表完整范围'
    : source.coverage === 'empty' ? '源端返回空页' : source.coverage === 'present' ? '本次收到的页'
      : '未知'
  const preview = [outcome, sample, source.coverage === 'partial' ? '部分覆盖' : ''].filter(Boolean).join(' · ')
  const detail = [
    `结果状态：${outcome}`, `查询参数\n${JSON.stringify(query, null, 2)}`,
    `数据范围：${coverage}`, `观测时间：${source.observed_at || '未知'}`,
    ...(failed ? [`错误：${display.error || '见原始返回'}`] : [
      `输入记录：${display.input_rows ?? '未知'}；匹配：${count}；条件未知：${unknown}；计数单位：${unit}`,
      unknown !== 0 ? '条件未知的记录不能当作已确认不匹配。' : '',
      `${groups ? '分组计数' : '记录内容'}\n${JSON.stringify(records, null, 2)}`,
      `因展示上限未展开的条目数：${display.records_omitted ?? 0}`,
    ]),
    `源端信息\n${JSON.stringify(source, null, 2)}`,
    '计数仅针对收到的数据；容器数不等于 Pod 数。生命周期累计重启数不等于时间窗口内次数。',
    `工具返回${display.result_excerpt_truncated ? '（仅前 12000 字符，已截断）' : '（本次传递内容）'}\n${display.result_excerpt || ''}`,
    `完整本次工具返回归档：${display.raw_ref || '未提供'}（不代表底层所有资源字段）`,
  ].filter(Boolean).join('\n\n')
  return { preview, detail }
}
