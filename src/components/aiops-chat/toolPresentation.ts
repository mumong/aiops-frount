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
  const excerpt = String(display.result_excerpt || '')
  const headline = outcome.startsWith('调用完成') ? firstLine(excerpt) || outcome : outcome
  const preview = [headline, scope].filter(Boolean).join(' · ')
  const notices = [...(Array.isArray(display.warnings) ? display.warnings : []),
    ...(Array.isArray(display.infos) ? display.infos : [])].map(String)
  const rangeNote = display.result_type === 'matrix'
    || rows.some(row => row.point_policy === 'latest_per_series' || Number(row.sample_count) > 1)
    ? '区间结果：每条序列只预览最新采样点，不是区间平均值。' : ''
  const status = failed ? `查询未成功：${firstLine(excerpt) || '见返回结果'}（结果不能视为 0）`
    : empty ? '请求成功，但没有匹配数据（不等于 0）'
      : unparsed ? '结果格式暂未解析，请直接看返回结果'
        : partial ? '部分结果未解析，请以返回结果为准' : ''
  const detail = composeDetail({
    args, status, excerpt, truncated: !!display.result_excerpt_truncated,
    parsed: rows, omitted: Number(display.measurements_omitted) || 0,
    notes: [rangeNote, ...notices].filter(Boolean),
  })
  return { preview, detail }
}

function firstLine(text: string) {
  const line = text.split('\n').map(part => part.trim()).find(Boolean) || ''
  return line.length > 140 ? line.slice(0, 140) + '…' : line
}

function formatArgs(args: Record<string, unknown>) {
  const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (!entries.length) return ''
  return entries.map(([key, value]) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text.includes('\n') || text.length > 100
      ? `- **${key}**:\n\n\`\`\`text\n${text}\n\`\`\``
      : `- **${key}**: \`${text}\``
  }).join('\n')
}

/** What a reader wants from a tool call: what was asked, what came back, and only the
 *  caveats that change how to read it. Agent-side bookkeeping (archive refs, parse
 *  flags, coverage enums) stays out of the expanded view. */
function composeDetail(parts: { args: Record<string, unknown>; status: string; excerpt: string;
  truncated: boolean; parsed: unknown[]; omitted: number; notes: string[] }) {
  const sections: string[] = []
  const args = formatArgs(parts.args)
  if (args) sections.push(`**调用参数**\n${args}`)
  if (parts.status) sections.push(`**说明**：${parts.status}`)
  // The raw excerpt is the result; when the backend sent only parsed rows, show those.
  const raw = parts.excerpt.trim()
  const body = raw || (parts.parsed.length ? JSON.stringify(parts.parsed, null, 2) : '')
  const fence = body.startsWith('{') || body.startsWith('[') ? 'json' : 'text'
  const caveat = parts.truncated ? '（仅前 12000 字符，已截断）' : !raw && body ? '（已解析数据）' : ''
  sections.push(`**返回结果**${caveat}\n\n\`\`\`${fence}\n${body || '（空）'}\n\`\`\``)
  const notes = parts.omitted > 0 ? [`返回结果之外另有 ${parts.omitted} 条未展开。`, ...parts.notes] : parts.notes
  if (notes.length) sections.push(`**提示**\n${notes.map(note => `- ${note}`).join('\n')}`)
  return sections.join('\n\n')
}

/** Record counts are not metric samples; source coverage is not selection coverage. */
function presentRecords(data: Record<string, unknown>, display: Record<string, unknown>, args: Record<string, unknown>) {
  const source = (display.source_metadata || {}) as Record<string, unknown>
  const page = display.pagination as Record<string, unknown> | undefined
  const partial = display.coverage === 'partial' || source.coverage === 'partial'
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
    : page ? `已返回 ${page.returned_rows} 条${groups ? '分组' : unit}记录${page.next_continue_token ? ' · 仍有后续数据，可继续读取' : ' · 已无后续数据'}`
    : `匹配 ${count} 条${unit}记录 · 条件未知 ${unknown} 条`
  const preview = [outcome, sample, partial ? '部分覆盖' : ''].filter(Boolean).join(' · ')
  const excerpt = String(display.result_excerpt || '')
  const status = failed ? `查询未成功：${display.error || firstLine(excerpt) || '见返回结果'}`
    : page?.next_continue_token
      ? `本页 ${page.returned_rows} 条，仍有 ${page.remaining_rows} 条后续数据（部分结果，不能代表完整范围；续读令牌 ${page.next_continue_token}）`
      : partial ? '部分结果，不能代表完整范围' : ''
  const detail = composeDetail({
    args: query, status, excerpt, truncated: !!display.result_excerpt_truncated,
    parsed: records, omitted: Number(display.records_omitted) || 0,
    notes: unknown !== 0 && unknown !== '未知' && !failed ? [`有 ${unknown} 条记录条件未知，不能当作已确认不匹配。`] : [],
  })
  return { preview, detail }
}
