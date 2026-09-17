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
