import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

function result(overrides = {}) {
  return {
    id: 'result-1',
    toolName: 'execute_pod_promql',
    status: 'success',
    resultPreview: 'memory usage increased',
    resultData: '{"status":"success"}',
    dimension: 'metrics',
    sourceSystem: 'prometheus',
    entity: { kind: 'Pod', namespace: 'ns-1', name: 'pod-1' },
    ...overrides,
  }
}

function group(groupId, overrides = {}) {
  const index = groupId.replace('g', '')
  return {
    groupId,
    abnormalType: 'CrashLoopBackOffRuntime',
    statusKeywords: ['CrashLoopBackOff'],
    entities: [{ kind: 'Pod', namespace: `ns-${index}`, name: `pod-${index}` }],
    results: [],
    ...overrides,
  }
}

async function renderBoard(state) {
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const { default: ParallelEvidenceBoard } = await server.ssrLoadModule(
      '/src/components/aiops-chat/ParallelEvidenceBoard.tsx',
    )
    return renderToStaticMarkup(React.createElement(ParallelEvidenceBoard, { state }))
  } finally {
    await server.close()
  }
}

test('renders every anomaly group collapsed and hides grouped tool details initially', async () => {
  const html = await renderBoard({
    status: 'running',
    groups: [
      group('g1', { results: [result()] }),
      group('g2'),
      group('g3'),
    ],
    pendingTools: [],
    unassignedResults: [],
  })

  assert.match(html, /3 个异常组/)
  assert.match(html, /g1/)
  assert.match(html, /g2/)
  assert.match(html, /g3/)
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 3)
  assert.doesNotMatch(html, /execute_pod_promql/)
  assert.doesNotMatch(html, /memory usage increased/)
})

test('renders streaming, failed, pending, and unassigned summary counts', async () => {
  const html = await renderBoard({
    status: 'running',
    groups: [
      group('g1', { results: [result()] }),
      group('g2', {
        results: [result({
          id: 'result-2',
          status: 'error',
          toolName: 'query_pod_logs',
          dimension: 'logging',
          sourceSystem: 'elasticsearch',
          entity: { kind: 'Pod', namespace: 'ns-2', name: 'pod-2' },
        })],
      }),
      group('g3'),
    ],
    pendingTools: [{ id: 'pending-1', toolName: 'query_pod_tracing', status: 'running' }],
    unassignedResults: [result({
      id: 'result-3',
      status: 'error',
      toolName: 'run_bash_command',
      dimension: 'other',
      entity: undefined,
    })],
  })

  assert.match(html, /持续接收结果/)
  assert.match(html, />3<\/strong>已返回/)
  assert.match(html, />1<\/strong>执行中/)
  assert.match(html, />2<\/strong>失败/)
  assert.match(html, /1 条未归属结果/)
  assert.match(html, /1 条工具调用等待结果归组/)
})
