import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/aiops-chat/toolPresentation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const { presentToolEvent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('empty is not zero; parameters and truncation remain visible', () => {
  const result = presentToolEvent({ tool_args: { promql: 'memory', namespace: 'ns', pod: 'pod' },
    tool_display: { coverage: 'empty', result_excerpt_truncated: true, raw_ref: '/raw' } })
  assert.match(result.preview, /无匹配数据/)
  assert.match(result.detail, /memory/)
  assert.match(result.detail, /已截断/)
  assert.doesNotMatch(result.detail, /\/raw|归档|解析状态|数据覆盖|执行状态/)
})

test('bytes display with units and timestamp; unknown units never guessed', () => {
  const result = presentToolEvent({ tool_display: { coverage: 'present', measurements: [
    { name: 'memory', value: '1048576', unit: 'bytes', observed_at: '2026-09-17' },
    { name: 'sample', value: '0.1', unit: 'unknown' },
  ] } })
  assert.match(result.preview, /1.00 MiB/)
  assert.match(result.preview, /单位未标注/)
  assert.match(result.detail, /返回结果/)
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
    assert.match(result.detail, /说明.*没有匹配数据（不等于 0）/)
    assert.doesNotMatch(result.detail, /执行状态|数据覆盖|解析状态/)
  }
})

test('transport failure is not hidden by an empty payload; real zero remains data', () => {
  assert.match(presentToolEvent({ transport_status: 'error',
    tool_display: { coverage: 'empty' } }).preview, /调用失败/)
  const zero = presentToolEvent({ status: 'success', tool_display: {
    coverage: 'present', parse_status: 'parsed', measurements: [{ value: '0' }] } })
  assert.match(zero.preview, /0/)
  assert.doesNotMatch(zero.preview, /无匹配/)
  assert.doesNotMatch(zero.detail, /说明/)
})

test('native Prometheus point displays value, labels and time without guessing unit', () => {
  const result = presentToolEvent({ tool_args: { query: 'arbitrary_expression' }, tool_display: {
    coverage: 'present', parse_status: 'parsed', series_count: 1,
    measurements: [{ value: '22.6439', unit: 'unknown', labels: {}, observed_at: '2026-10-08T09:11:23Z' }],
  } })
  assert.match(result.preview, /22.6439/)
  assert.doesNotMatch(result.preview, /%/)
  assert.match(result.detail, /调用参数[\s\S]*arbitrary_expression/)
  assert.equal(result.detail.split('arbitrary_expression').length - 1, 1)
})

test('unsupported and partial results are not described as absent', () => {
  const result = presentToolEvent({ tool_display: { parse_status: 'unsupported', coverage: 'unknown' } })
  assert.match(result.preview, /暂未解析/)
  assert.doesNotMatch(result.preview, /无匹配数据/)
  const partial = presentToolEvent({ tool_display: { parse_status: 'partial', coverage: 'present',
    measurements: [{ value: '0' }], unparsed_series: 2, warnings: ['source warning'] } })
  assert.match(partial.preview, /部分结果未解析/)
  assert.match(partial.detail, /说明.*部分结果未解析/)
  assert.match(partial.detail, /提示[\s\S]*source warning/)
})

test('matrix latest samples and bounded rows are explicitly labeled', () => {
  const result = presentToolEvent({ tool_display: { coverage: 'present', result_type: 'matrix',
    measurements: [{ value: '8', sample_count: 20, point_policy: 'latest_per_series' }], measurements_omitted: 5 } })
  assert.match(result.detail, /最新采样点/)
  assert.match(result.detail, /不是区间平均值/)
  assert.doesNotMatch(result.detail, /未展开的条目数/)
})

test('backend error coverage takes precedence and text is not a numeric metric', () => {
  assert.match(presentToolEvent({ tool_display: { coverage: 'error' } }).preview, /调用失败/)
  const result = presentToolEvent({ tool_display: { coverage: 'present',
    measurements: [{ name: 'prometheus_text', value: 'OK', value_kind: 'text' }] } })
  assert.match(result.preview, /OK/)
  assert.doesNotMatch(result.preview, /单位/)
})

test('record groups retain unit, source coverage and counts without metric guesses', () => {
  const shown = presentToolEvent({ status: 'success', semantic_success: true, tool_display: {
    contract_version: 'evidence-records.v1', parse_status: 'parsed', semantic_success: true,
    execution_status: 'success', record_unit: 'pod', result_type: 'groups',
    input_rows: 3, matched_rows: 3, unknown_filter_rows: 0,
    query: { record_type: 'pod', group_by: 'node' }, records: [{ node: 'node1', count: 3 }],
    source_metadata: { coverage: 'partial', observed_at: '2026-10-09T00:00:00Z', next_continue_token: 'next' },
    records_omitted: 0, raw_ref: '/records/raw',
  } })
  assert.match(shown.preview, /node1: 3 Pod/)
  assert.match(shown.preview, /部分覆盖/)
  assert.match(shown.detail, /不能代表完整范围/)
  assert.match(shown.detail, /调用参数[\s\S]*group_by/)
  assert.doesNotMatch(shown.detail, /未提取结构化数值|单位未标注|源端信息|归档/)
})

test('byte-paged records are partial success with a continuation, not a query failure', () => {
  const shown = presentToolEvent({ status: 'success', tool_display: {
    contract_version: 'evidence-records.v1', parse_status: 'parsed', semantic_success: true,
    execution_status: 'success', record_unit: 'pod', result_type: 'records', coverage: 'partial',
    matched_rows: 72, records: [], source_metadata: { coverage: 'present' },
    pagination: { returned_rows: 12, remaining_rows: 60, total_rows: 72, next_continue_token: 'lr1.test.12' },
  } })
  assert.match(shown.preview, /已返回 12 条Pod记录/)
  assert.match(shown.preview, /仍有后续数据/)
  assert.doesNotMatch(shown.preview, /查询未成功/)
  assert.match(shown.detail, /不能代表完整范围/)
  assert.match(shown.detail, /lr1.test.12/)
})

test('state metric previews retain reason and target without inferring health from one', () => {
  const data = { tool_display: { coverage: 'present', measurements: [{
    name: 'kube_pod_container_status_last_terminated_reason', value: '1', unit: 'unitless',
    labels: { namespace: 'demo', pod: 'workload', container: 'app', reason: 'OOMKilled' },
    observed_at: '2026-10-10T02:04:24Z',
  }] } }
  const before = structuredClone(data)
  const result = presentToolEvent(data)
  assert.match(result.preview, /reason="OOMKilled"/)
  assert.match(result.preview, /pod="workload"/)
  assert.match(result.preview, /container="app"/)
  assert.match(result.preview, /: 1 unitless/)
  assert.doesNotMatch(result.preview, /健康|异常|故障/)
  assert.match(result.detail, /02:04:24/)
  assert.deepEqual(data, before)
})

test('same metric at distinct endpoints preserves zero and one as separate observations', () => {
  const result = presentToolEvent({ tool_display: { coverage: 'present', measurements: [
    { name: 'up', value: '0', labels: { pod: 'p', instance: 'a:80', endpoint: 'http' } },
    { name: 'up', value: '1', labels: { pod: 'p', instance: 'a:81', endpoint: 'admin' } },
  ] } })
  assert.match(result.preview, /up: 0.*instance="a:80".*endpoint="http"/)
  assert.match(result.preview, /up: 1.*instance="a:81".*endpoint="admin"/)
  assert.doesNotMatch(result.preview, /无匹配|健康|故障/)
})

test('info and custom labels are visible without a metric-name-specific template', () => {
  for (const name of ['kube_pod_info', 'custom_metric']) {
    const result = presentToolEvent({ tool_display: { coverage: 'present', measurements: [{
      name, value: '1', labels: { node: 'node2', custom_label: 'east', shard: 0, enabled: false },
    }] } })
    for (const label of ['node="node2"', 'custom_label="east"', 'shard="0"', 'enabled="false"']) {
      assert.ok(result.preview.includes(label), label)
    }
    assert.doesNotMatch(result.preview, /健康|故障/)
  }
})

test('bounded preview discloses hidden rows and labels but retains complete detail', () => {
  const longValue = 'x'.repeat(150)
  const result = presentToolEvent({ tool_display: { coverage: 'present', measurements_omitted: 2,
    measurements: Array.from({ length: 4 }, (_, i) => ({ name: 'sample', value: i, labels: {
      reason: 'R', condition: 'Ready', pod: 'p', container: 'c', instance: longValue,
      endpoint: 'e', custom: 'retained', zone: 'east',
    } })),
  } })
  assert.match(result.preview, /另 2 个标签/)
  assert.match(result.preview, /另有 3 条结果未在预览展示/)
  assert.ok(!result.preview.includes(longValue))
  assert.ok(result.detail.includes(longValue))
  assert.match(result.detail, /"custom": "retained"/)
  assert.match(result.detail, /另有 2 条未展开/)
})

test('zero matching records with unknown predicates is success, not proof of absence', () => {
  const shown = presentToolEvent({ status: 'success', tool_display: {
    contract_version: 'evidence-records.v1', parse_status: 'parsed', semantic_success: true,
    record_unit: 'container', result_type: 'records', input_rows: 5, matched_rows: 0,
    unknown_filter_rows: 3, records: [], source_metadata: { coverage: 'present' },
  } })
  assert.match(shown.preview, /匹配 0 条容器记录.*条件未知 3/)
  assert.doesNotMatch(shown.preview, /失败/)
  assert.match(shown.detail, /不能当作已确认不匹配/)
})

test('record failure and display omission remain explicit', () => {
  const common = { contract_version: 'evidence-records.v1', source_metadata: {} }
  const failed = presentToolEvent({ transport_status: 'error', tool_display: common })
  assert.match(failed.preview, /查询未成功/)
  const bounded = presentToolEvent({ tool_display: { ...common, parse_status: 'parsed', record_unit: 'pod',
    matched_rows: 21, input_rows: 21, unknown_filter_rows: 0, records_omitted: 1,
    records: [{ ready: false, value: 0 }], result_excerpt_truncated: true } })
  assert.match(bounded.detail, /另有 1 条未展开/)
  assert.match(bounded.detail, /"ready": false/)
  assert.match(bounded.detail, /"value": 0/)
  assert.match(bounded.detail, /已截断/)
})
