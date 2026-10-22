import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const m = await server.ssrLoadModule('/src/components/aiops-chat/traceModel.ts')
const name = () => 'query_pod_logs'

test('collapsed row shows the newest complete sentence of delivered text, not a list fragment', () => {
  const thought = text => [{ kind: 'text', text }]
  assert.equal(m.latestActivity(thought('用户要求诊断。\n已知：\n- Pod: `w`\n2. 检查 Pod 配置和 OOM'), name), '检查 Pod 配置和 OOM')
  assert.equal(m.latestActivity(thought('查 previous logs 确认 `APP_CONFIG_PATH` 缺失。待验证假设：'), name),
    '查 previous logs 确认 APP_CONFIG_PATH 缺失。')
  assert.equal(m.latestActivity([{ kind: 'thought', text: 'x' }, { kind: 'tool', text: '', toolId: 't' }], name), '调用 query_pod_logs')
})

test('text steps: tokens extend, completion confirms without duplication, the ack is noise', () => {
  let trace = m.traceText([], 'ai_token', '发现 ')
  trace = m.traceText(trace, 'ai_token', '4 个')
  trace = m.traceText(trace, 'ai_message', '发现 4 个异常')
  trace = m.traceText(trace, 'ai_message', '结构化结果已生成。')
  assert.deepEqual(trace.map(step => step.text), ['发现 4 个异常'])
  assert.deepEqual(m.traceText([], 'ai_token', '\n\n'), [])
})

test('thought chunks merge until a tool call; stages never merge', () => {
  let trace = m.traceThought([], 'a', 'evidence')
  trace = m.traceThought(trace, 'b', 'evidence')
  trace = m.traceThought(trace, 'c', 'rca')
  trace = m.traceTool(trace, 't1', 'rca')
  trace = m.traceThought(trace, 'd', 'rca')
  assert.deepEqual(trace.map(step => [step.kind, step.text, step.stage]),
    [['thought', 'ab', 'evidence'], ['thought', 'c', 'rca'], ['tool', '', 'rca'], ['thought', 'd', 'rca']])
})

test('a streamed acknowledgement is replaced by the stage text that follows', () => {
  let trace = m.traceText([], 'ai_token', '结构化结果已生成。')
  trace = m.traceText(trace, 'ai_message', '发现 2 个异常 Pod')
  assert.deepEqual(trace.map(step => step.text), ['发现 2 个异常 Pod'])
})

test('meta lines like [Tool Calls Generation] and short asides are not shown as activity', () => {
  const trace = [{ kind: 'text', text: '查 Pod 上一次崩溃的日志。\n[Tool Calls Generation]\n语言为中文。' }]
  assert.equal(m.latestActivity(trace, name), '查 Pod 上一次崩溃的日志。')
})

test('raw reasoning never becomes the row summary (it is a draft, shown collapsed)', () => {
  assert.equal(m.latestActivity([{ kind: 'thought', text: '可能是 OOM，先看日志。' }], name), '')
  assert.equal(m.latestActivity([{ kind: 'tool', text: '', toolId: 't' }, { kind: 'thought', text: '下一步看指标。' }], name),
    '调用 query_pod_logs')
})
