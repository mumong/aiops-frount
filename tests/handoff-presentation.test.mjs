import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/aiops-chat/handoffPresentation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { isLegacyHandoff, emptyNodeMessage, visibleNarrative, queryNarrative } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('diagnostic prose and assignments are Markdown, not key/value fields', () => {
  assert.equal(isLegacyHandoff('用户问题：workload\n## 根因\nFAILURE_MODE=oom_growth，Exit Code=137'), false)
  assert.equal(isLegacyHandoff('## CPU\nrate(container_cpu{namespace="xnet"}[5m])'), false)
  assert.equal(isLegacyHandoff('用户问题：workload，FAILURE_MODE=oom_growth'), false)
  assert.equal(isLegacyHandoff('layer=QUERY layers=QUERY'), true)
})

test('completed empty stages do not claim to be waiting', () => {
  assert.match(emptyNodeMessage(true), /等待/)
  assert.doesNotMatch(emptyNodeMessage(false), /等待/)
})

test('blank streamed narrative creates no empty panel and retains code indentation', () => {
  assert.equal(visibleNarrative('\n \r\n\t'.repeat(100)), '')
  const report = '## 证据\n\n```yaml\nkey:\n    value: 64Mi\n\n\n```'
  assert.equal(visibleNarrative('\n'.repeat(80) + report + '\n'.repeat(80)), report)
  assert.equal(visibleNarrative('    indented code'), '    indented code')
})

test('query streams Markdown answer without JSON envelope or partial escapes', () => {
  const answer = '## CPU\n\n| Pod | 值 |\n|---|---|\n| x | 1 |\n```json\n{"value":1}\n```\nC:\\tmp'
  const raw = JSON.stringify({intent: 'CPU', scope: 'xnet', status: 'answered', answer, evidence_refs: []})
  assert.equal(queryNarrative(raw), answer)
  for (let i = 0; i < raw.length; i++) {
    const displayed = queryNarrative(raw.slice(0, i))
    assert.ok(answer.startsWith(displayed), `invalid prefix at ${i}: ${displayed}`)
  }
  assert.equal(queryNarrative('正在查询。\n' + raw), '正在查询。\n\n\n' + answer)
  assert.equal(queryNarrative('```json\n' + raw + '\n```'), answer)
  assert.equal(queryNarrative('{"answer":"\\u4e'), '')
  assert.equal(queryNarrative('{"answer":"\\u4e2d"}'), '中')
})
