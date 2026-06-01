import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

async function loadPolicyModule() {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/chatRequestPolicy.ts', import.meta.url),
    'utf8',
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
  }).outputText
  const encoded = Buffer.from(compiled).toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

test('ask requests include remediation so diagnosis can continue into approval flow', async () => {
  const { buildChatRequestParams } = await loadPolicyModule()

  const params = buildChatRequestParams('我的集群有什么异常？', 'ask')

  assert.equal(params.get('q'), '我的集群有什么异常？')
  assert.equal(params.get('format'), 'sse')
  assert.equal(params.get('stream'), 'true')
  assert.equal(params.get('remediate'), 'true')
})

test('query requests do not ask backend to run remediation safety review', async () => {
  const { buildChatRequestParams } = await loadPolicyModule()

  const params = buildChatRequestParams('查询集群CPU和内存使用率', 'query')

  assert.equal(params.get('q'), '查询集群CPU和内存使用率')
  assert.equal(params.get('format'), 'sse')
  assert.equal(params.get('stream'), 'true')
  assert.equal(params.has('remediate'), false)
})

test('only ask mode processes remediation events in the frontend', async () => {
  const { shouldProcessRemediation } = await loadPolicyModule()

  assert.equal(shouldProcessRemediation('ask'), true)
  assert.equal(shouldProcessRemediation('query'), false)
})
