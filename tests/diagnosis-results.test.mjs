import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { default: DiagnosisResults } = await server.ssrLoadModule('/src/components/aiops-chat/DiagnosisResults.tsx')
const { transitionChatEvent } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')
const cases = Array.from({ length: 100 }, (_, i) => ({ group_id: `g${i}`, execution_status: 'completed',
  summary: `简短诊断${i}`, report: `完整报告${i}`, target: { entities: [{ namespace: 'demo', name: `pod-${i}` }] } }))

test('case rendering preserves independent results and bounds initial DOM for 100 cases', () => {
  const html = renderToStaticMarkup(React.createElement(DiagnosisResults, { message: {
    diagnosisCases: cases, diagnosisOverview: { total: 100, completed: 100, partial: 0,
      text: '总览生成失败；独立结果仍可查看。', failed: true }, diagnosisFooter: '📋 Runbook 参考\n\n- manual',
  } }))
  assert.equal((html.match(/<details/g) || []).length, 10)
  assert.equal((html.match(/<details open/g) || []).length, 10)
  assert.match(html, /总览生成失败/)
  assert.match(html, /完整报告9/)
  assert.doesNotMatch(html, /完整报告99/)
  assert.match(html, /显示更多/)
  assert.match(html, /manual/)
})

test('full report exposes phenomenon, real evidence and conclusion by default', () => {
  const report = '### 诊断结论\n\n原因待核实。\n\n### 异常现象\n\nReady=False\n\n### 关键证据\n\n'
    + '| 来源与时间 | 真实工具结果 | 判断 |\n|---|---|---|\n'
    + '| kubectl_events | connection refused:8081 | 探针失败 |\n\n'
    + '### 原因分析\n\n探针失败 → 未就绪。\n\n### 待核实与采集边界\n\n未实测监听端口。'
  const html = renderToStaticMarkup(React.createElement(DiagnosisResults, { message: {
    diagnosisCases: [{...cases[0], report}],
  } }))
  assert.match(html, /<details open/)
  assert.match(html, /<table/)
  for (const value of ['诊断结论', '异常现象', '关键证据', '原因分析', '待核实与采集边界', 'connection refused:8081']) {
    assert.ok(html.includes(value), value)
  }
})

test('final transport stores case results for session reload without modifying full text export', () => {
  const state = { nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0 }
  const next = transitionChatEvent(state, { event: 'final', data: JSON.stringify({
    answer: 'full markdown export', diagnosis_cases: cases,
    diagnosis_overview: { text: '简短总览', total: 100, completed: 100, partial: 0, failed: false },
    diagnosis_footer: 'footer', repair_record: { kind: 'diagnosis', run_id: 'source-run' },
  }) }, 'm', 'ask', 1234)
  let messages = [{ id: 'm', role: 'assistant', content: '', status: 'streaming' }]
  for (const update of next.messageUpdates) messages = update(messages)
  const restored = JSON.parse(JSON.stringify(messages))[0]
  assert.equal(restored.diagnosisCases.length, 100)
  assert.equal(restored.content, 'full markdown export')
  assert.equal(restored.diagnosisFooter, 'footer')
  assert.equal(restored.repairRecord.run_id, 'source-run')
})
