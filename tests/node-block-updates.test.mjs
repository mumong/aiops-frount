import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

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
