import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

async function render(props) {
  const server = await createServer({
    root: projectRoot, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true }, appType: 'custom',
  })
  try {
    const module = await server.ssrLoadModule('/src/components/aiops-chat/RepairProgress.tsx')
    return renderToStaticMarkup(React.createElement(module.default, props))
  } finally {
    await server.close()
  }
}

const progress = {
  reasoning: '先读取 Deployment 的探针配置',
  tools: [
    { id: 'c1', name: 'kubectl_get_yaml', args: '{"kind":"deployment","name":"workload"}', status: 'success',
      preview: 'readinessProbe: port 8081', duration_seconds: 0.4 },
    { id: 'c2', name: 'kubernetes_tabular_query', args: '{}', status: 'error', preview: 'Command failed' },
    { id: 'c3', name: 'kubectl_describe', args: '', status: 'running' },
  ],
}

test('planning process lists every tool call with its status and keeps reasoning collapsed', async () => {
  const html = await render({ progress, status: 'planning', mode: 'review' })
  assert.match(html, /规划过程/)
  assert.match(html, /3 次工具调用/)
  assert.match(html, /kubectl_get_yaml/)
  assert.match(html, /kubernetes_tabular_query/)
  assert.match(html, /1 失败/)
  assert.match(html, /执行中/)
  assert.match(html, /readinessProbe: port 8081/)
  assert.match(html, /模型思考过程/)
  assert.match(html, /<details open=""[^>]*aria-label="规划过程"/)  // open while planning
})

test('stage strip marks where the job is and collapses the process once planned', async () => {
  const html = await render({ progress, status: 'awaiting_approval', mode: 'review' })
  assert.match(html, /aria-current="step"[^>]*>[^<]*<span[^>]*>2<\/span>审批/)
  assert.doesNotMatch(html, /<details open=""[^>]*aria-label="规划过程"/)
  const done = await render({ progress: { reasoning: '', tools: [{ id: 'x', name: 'kubectl_describe', args: '', status: 'unfinished' }] }, status: 'planned' })
  assert.match(done, /未返回/)
  const auto = await render({ progress: undefined, status: 'recovered', mode: 'auto' })
  assert.match(auto, /自动执行/)
  assert.match(auto, /已恢复/)
  assert.doesNotMatch(auto, /规划过程/)
})
