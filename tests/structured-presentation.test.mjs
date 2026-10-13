import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = readFileSync(new URL('../src/components/aiops-chat/structuredPresentation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText
const { splitStructuredContent: split } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('mixed handoff and compaction preserve all original bytes', () => {
  const raw = '我的集群有什么问题？' + JSON.stringify({protected_handoff:{targets:[],summary:'含有 } 和 " 引号'}}) + '[working_context_summary] 旧摘要'
  const parts = split(raw)
  assert.deepEqual(parts.map(p => p.kind), ['text','json','internal'])
  assert.equal(parts.map(p => p.raw).join(''), raw)
  for (let i = 0; i < raw.length; i++) assert.equal(split(raw.slice(0,i)).map(p => p.raw).join(''), raw.slice(0,i))
})
test('arrays, nested objects, malformed and incomplete JSON remain accessible', () => {
  assert.equal(split('[{"value":1}]')[0].kind, 'json')
  assert.equal(split('{"key":')[0].kind, 'internal')
  assert.equal(split('{"key":bad}')[0].kind, 'text')
  const raw = '```json\n{"a":[1,2]}\n```\n结束'
  assert.equal(split(raw)[0].kind, 'json')
  assert.equal(split(raw).map(p=>p.raw).join(''), raw)
})
test('ordinary prose, PromQL and code are not reinterpreted', () => {
  for (const raw of ['说明\nrate(cpu{mode="idle"}[5m])','```js\nconst a = {"a":1}\n```','正在检查 Pod 状态。']) {
    assert.deepEqual(split(raw), [{kind:'text',raw}])
  }
})
