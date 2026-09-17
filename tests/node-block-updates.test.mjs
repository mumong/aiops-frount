import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

test('parallel same-name results use call IDs even when completed out of order', async () => {
  const m = await loadNodeBlockModule()
  let blocks = []
  for (const id of ['cpu', 'memory']) blocks = m.startNodeToolCall(blocks, 'query_collect', '查询', {
    id, backendCallId: id, toolName: 'execute_pod_promql', status: 'running',
  })
  blocks = m.finishNodeToolCall(blocks, 'query_collect', '查询', 'execute_pod_promql', 'success', 'empty', 'memory detail', 'memory')
  assert.equal(blocks[0].toolCalls[0].status, 'running')
  assert.equal(blocks[0].toolCalls[1].resultData, 'memory detail')
  blocks = m.finishNodeToolCall(blocks, 'query_collect', '查询', 'execute_pod_promql', 'success', '2m', 'cpu detail', 'cpu')
  assert.equal(blocks[0].toolCalls[0].resultData, 'cpu detail')
})

test('runtime status clears on activity and terminal outcomes', async () => {
  const m = await loadNodeBlockModule()
  const blocks = m.setNodeRuntimeStatus([], 'query_collect', '查询', '整理 1/2', 'running', 123)
  assert.equal(blocks[0].runtimeStatus.at, 123)
  const active = m.applyNodeThinkingEvent(blocks, 'query_collect', '查询', 'ai_token', '结果')
  assert.equal(active[0].runtimeStatus, undefined)
  for (const status of ['stopped', 'complete']) {
    const ended = m.settleNodeBlocks(blocks, status)
    assert.equal(ended[0].status, status)
    assert.equal(ended[0].runtimeStatus, undefined)
  }
})

test('stream completion confirms text without duplication or preview truncation', async () => {
  const { applyNodeThinkingEvent: apply } = await loadNodeBlockModule()
  const full = '查询 CPU 和磁盘。'.repeat(100)
  let blocks = apply([], 'query_collect', '查询', 'ai_token', full.slice(0, 100))
  blocks = apply(blocks, 'query_collect', '查询', 'ai_token', full.slice(100))
  blocks = apply(blocks, 'query_collect', '查询', 'ai_message', full.slice(0, 500))
  assert.equal(blocks[0].thinkingTokens, full)
  // The same sentence in another genuine model turn must not be suppressed.
  blocks = apply(blocks, 'query_collect', '查询', 'ai_token', full)
  blocks = apply(blocks, 'query_collect', '查询', 'ai_message', full)
  assert.equal(blocks[0].thinkingTokens, full + '\n\n' + full)
})

test('full message repairs a partial stream and nonstreaming answers still display', async () => {
  const { applyNodeThinkingEvent: apply } = await loadNodeBlockModule()
  let blocks = apply([], 'a', 'A', 'ai_token', 'hello')
  blocks = apply(blocks, 'b', 'B', 'ai_message', 'other node')
  blocks = apply(blocks, 'a', 'A', 'ai_message', 'hello world')
  assert.equal(blocks[0].thinkingTokens, 'hello world')
  assert.equal(blocks[1].thinkingTokens, 'other node')
  blocks = apply(blocks, 'a', 'A', 'ai_token', 'different')
  blocks = apply(blocks, 'a', 'A', 'ai_message', 'not the same message')
  assert.ok(blocks[0].thinkingTokens.endsWith('different\n\nnot the same message'))
})

async function loadNodeBlockModule() {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/nodeBlockUpdates.ts', import.meta.url),
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

test('thinking tokens are appended to the event node instead of the last node', async () => {
  const { appendNodeThinking } = await loadNodeBlockModule()
  const parallelEvidence = {
    status: 'running',
    groups: [],
    pendingTools: [],
    unassignedResults: [],
  }
  const blocks = [
    {
      nodeId: 'layer',
      nodeName: '问题定位',
      status: 'complete',
      thinkingTokens: '定位推理',
      toolCalls: [],
      parallelEvidence,
    },
    {
      nodeId: 'evidence',
      nodeName: '证据采集',
      status: 'running',
      thinkingTokens: '',
      toolCalls: [],
    },
  ]

  const next = appendNodeThinking(blocks, 'layer', '问题定位', '补充')

  assert.equal(next[0].thinkingTokens, '定位推理补充')
  assert.equal(next[1].thinkingTokens, '')
  assert.deepEqual(next[0].parallelEvidence, parallelEvidence)
})

test('missing event nodes are created before appending thinking tokens', async () => {
  const { appendNodeThinking } = await loadNodeBlockModule()

  const next = appendNodeThinking([], 'evidence', '证据采集', '开始采集证据')

  assert.deepEqual(next, [
    {
      nodeId: 'evidence',
      nodeName: '证据采集',
      status: 'running',
      thinkingTokens: '开始采集证据',
      toolCalls: [],
    },
  ])
})

test('tool results update only the matching running tool in the event node', async () => {
  const { startNodeToolCall, finishNodeToolCall } = await loadNodeBlockModule()
  let blocks = [
    {
      nodeId: 'layer',
      nodeName: '问题定位',
      status: 'running',
      thinkingTokens: '',
      toolCalls: [],
    },
    {
      nodeId: 'evidence',
      nodeName: '证据采集',
      status: 'running',
      thinkingTokens: '',
      toolCalls: [],
    },
  ]

  blocks = startNodeToolCall(blocks, 'layer', '问题定位', {
    id: 'tool-1',
    toolName: 'execute_prometheus_instant_query',
    status: 'running',
  })
  blocks = startNodeToolCall(blocks, 'evidence', '证据采集', {
    id: 'tool-2',
    toolName: 'execute_prometheus_instant_query',
    status: 'running',
  })

  const next = finishNodeToolCall(
    blocks,
    'evidence',
    '证据采集',
    'execute_prometheus_instant_query',
    'success',
    'evidence result',
    '{"node":"evidence"}',
  )

  assert.equal(next[0].toolCalls[0].status, 'running')
  assert.equal(next[1].toolCalls[0].status, 'success')
  assert.equal(next[1].toolCalls[0].resultPreview, 'evidence result')
})
