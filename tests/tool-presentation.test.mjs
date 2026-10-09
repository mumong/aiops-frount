import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/aiops-chat/toolPresentation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
const { presentToolEvent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('empty is not zero; parameters and truncation remain visible', () => {
  const result = presentToolEvent({ tool_args: { promql: 'memory', namespace: 'ns', pod: 'pod' },
    tool_display: { coverage: 'empty', result_excerpt_truncated: true, raw_ref: '/raw' } })
  assert.match(result.preview, /无匹配数据/)
  assert.match(result.detail, /memory/)
  assert.match(result.detail, /已截断/)
  assert.match(result.detail, /\/raw/)
})

test('bytes display with units and timestamp; unknown units never guessed', () => {
  const result = presentToolEvent({ tool_display: { coverage: 'present', measurements: [
    { name: 'memory', value: '1048576', unit: 'bytes', observed_at: '2026-09-17' },
    { name: 'sample', value: '0.1', unit: 'unknown' },
  ] } })
  assert.match(result.preview, /1.00 MiB/)
  assert.match(result.preview, /单位未标注/)
  assert.match(result.detail, /2026-09-17/)
})

test('semantic rejection overrides transport success', () => {
  const result = presentToolEvent({ status: 'success', semantic_success: false,
    tool_display: { coverage: 'error', result_excerpt: 'missing_pod_scope' } })
  assert.match(result.preview, /失败或查询被拒绝/)
  assert.match(result.detail, /missing_pod_scope/)
})

test('successful empty metric response keeps execution, coverage and parsing separate', () => {
  for (const tool_name of ['execute_prometheus_instant_query', 'execute_prometheus_range_query', 'execute_pod_promql']) {
    const result = presentToolEvent({ tool_name, status: 'success', transport_status: 'success',
      semantic_success: true, tool_display: { coverage: 'empty', parse_status: 'parsed', measurements: [] } })
    assert.match(result.preview, /请求成功.*无匹配数据/)
    assert.doesNotMatch(result.preview, /失败/)
    assert.match(result.detail, /执行状态：成功/)
    assert.match(result.detail, /数据覆盖：无匹配数据/)
    assert.match(result.detail, /解析状态：已解析/)
  }
})

test('transport failure is not hidden by an empty payload; real zero remains data', () => {
  assert.match(presentToolEvent({ transport_status: 'error',
    tool_display: { coverage: 'empty' } }).preview, /调用失败/)
  const zero = presentToolEvent({ status: 'success', tool_display: {
    coverage: 'present', parse_status: 'parsed', measurements: [{ value: '0' }] } })
  assert.match(zero.preview, /0/)
  assert.doesNotMatch(zero.preview, /无匹配/)
  assert.match(zero.detail, /数据覆盖：有数据/)
})

test('native Prometheus point displays value, labels and time without guessing unit', () => {
  const result = presentToolEvent({ tool_args: { query: 'arbitrary_expression' }, tool_display: {
    coverage: 'present', parse_status: 'parsed', series_count: 1,
    measurements: [{ value: '22.6439', unit: 'unknown', labels: {}, observed_at: '2026-10-08T09:11:23Z' }],
  } })
  assert.match(result.preview, /22.6439/)
  assert.doesNotMatch(result.preview, /%/)
  assert.match(result.detail, /09:11:23/)
  assert.doesNotMatch(result.detail, /未返回可展示|查询目的：见查询参数/)
  assert.equal(result.detail.split('arbitrary_expression').length - 1, 1)
})

test('unsupported and partial results are not described as absent', () => {
  const result = presentToolEvent({ tool_display: { parse_status: 'unsupported', coverage: 'unknown' } })
  assert.match(result.preview, /暂未解析/)
  assert.doesNotMatch(result.preview, /无匹配数据/)
  const partial = presentToolEvent({ tool_display: { parse_status: 'partial', coverage: 'present',
    measurements: [{ value: '0' }], unparsed_series: 2, warnings: ['source warning'] } })
  assert.match(partial.preview, /部分结果未解析/)
  assert.match(partial.detail, /未解析的序列数：2/)
  assert.match(partial.detail, /source warning/)
})

test('matrix latest samples and bounded rows are explicitly labeled', () => {
  const result = presentToolEvent({ tool_display: { coverage: 'present', result_type: 'matrix',
    measurements: [{ value: '8', sample_count: 20, point_policy: 'latest_per_series' }], measurements_omitted: 5 } })
  assert.match(result.detail, /最新采样点/)
  assert.match(result.detail, /不是整个区间的平均值/)
  assert.match(result.detail, /未展开的条目数：5/)
})

test('backend error coverage takes precedence and text is not a numeric metric', () => {
  assert.match(presentToolEvent({ tool_display: { coverage: 'error' } }).preview, /调用失败/)
  const result = presentToolEvent({ tool_display: { coverage: 'present',
    measurements: [{ name: 'prometheus_text', value: 'OK', value_kind: 'text' }] } })
  assert.match(result.preview, /OK/)
  assert.doesNotMatch(result.preview, /单位/)
})
