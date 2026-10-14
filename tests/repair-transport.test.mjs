import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const code = ts.transpileModule(readFileSync(new URL('../src/components/aiops-chat/repairTransport.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } }).outputText
const { repairJson, RepairRequestTimeout } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('timeout aborts waiting without retrying mutation', async () => {
  const original = global.fetch
  let requests = 0
  global.fetch = async (_url, init) => {
    requests++
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  }
  try {
    await assert.rejects(repairJson('/approve', { method: 'POST' }, 15), RepairRequestTimeout)
    assert.equal(requests, 1)
  } finally { global.fetch = original }
})

test('reads successful response; non-success does not count as approval', async () => {
  const original = global.fetch
  try {
    global.fetch = async () => new Response(JSON.stringify({ success: true }))
    assert.deepEqual(await repairJson('/approve'), { success: true })
    global.fetch = async () => new Response(JSON.stringify({ detail: 'expired' }), { status: 404 })
    await assert.rejects(repairJson('/approve'), /expired/)
  } finally { global.fetch = original }
})

test('gateway HTML error pages yield a readable status error instead of a JSON parse error', async () => {
  const original = global.fetch
  try {
    global.fetch = async () => new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502, headers: { 'content-type': 'text/html' },
    })
    await assert.rejects(repairJson('/approve'), { message: '请求失败 (502)' })
    global.fetch = async () => new Response('upstream timed out', { status: 504 })
    await assert.rejects(repairJson('/approve'), { message: '请求失败 (504)' })
    global.fetch = async () => new Response('<html>ok?</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    await assert.rejects(repairJson('/approve'), /响应格式无效 \(200\)/)
  } finally { global.fetch = original }
})
