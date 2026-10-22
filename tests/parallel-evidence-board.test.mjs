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

test('terminal board preserves missing results without showing endless running', async () => {
  const html = await renderBoard({status: 'complete', groups: [group('g1'), group('g2')],
    pendingTools: [{id: 'unfinished', toolName: 'query_pod_tracing', status: 'running'}],
    unassignedResults: []})
  assert.match(html, /1 条未返回/)
  assert.match(html, /阶段已结束，不再等待/)
  assert.match(html, /本阶段已结束/)
  assert.doesNotMatch(html, /执行中|进行中/)
})

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
  assert.match(html, /异常组 1/)
  assert.match(html, /异常组 2/)
  assert.match(html, /异常组 3/)
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

  assert.match(html, /0\/3 组已结束 · 3 条证据/)
  assert.match(html, /1 条执行中/)
  assert.match(html, /2 条失败/)
  assert.match(html, /1 条未归属结果/)
  assert.doesNotMatch(html, /本阶段已结束/)
})

test('groups are sectioned by cluster; a finished group carries its conclusion in the header', async () => {
  const html = await renderBoard({
    status: 'complete',
    groups: [
      group('g1', { clusterLabel: 'edge-89', terminalStatus: 'completed',
        analysisStreams: { rca: { text: '**诊断结论**：探针端口配置错误\n\n**原因**：8081 vs 8080' } } }),
      group('g2', { clusterLabel: 'edge-88' }),
      group('g3', { clusterLabel: 'edge-89' }),
    ],
    pendingTools: [], unassignedResults: [],
  })
  const sections = [...html.matchAll(/class="[^"]*clusterName[^"]*">([^<]+)</g)].map(m => m[1])
  assert.deepEqual(sections, ['edge-89', 'edge-88'])
  // g3 is listed under edge-89, not after edge-88
  assert.ok(html.indexOf('异常组 3') < html.indexOf('>edge-88<'))
  assert.match(html, /探针端口配置错误/)
  assert.doesNotMatch(html, /\*\*诊断结论/)
})
