import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { transitionChatEvent } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')
const { textField, trimmedField } = await server.ssrLoadModule('/src/components/aiops-chat/sseEvents.ts')

function makeReplay() {
  let state = { nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0 }
  let messages = [{ id: 'msg-1', role: 'assistant', content: '', status: 'streaming', timestamp: 1 }]
  let answer = '', streaming = true, activity = 0
  return { event(event, data, mode = 'ask') {
    const next = transitionChatEvent(state, {
      event, data: typeof data === 'string' ? data : JSON.stringify(data),
    }, 'msg-1', mode, 1234)
    state = next
    for (const update of next.messageUpdates) messages = update(messages)
    if (next.finalAnswer !== undefined) answer = next.finalAnswer
    if (next.streaming !== undefined) streaming = next.streaming
    return { messages, blocks: state.nodeBlocks, answer, streaming, activity: ++activity }
  } }
}

test('same-batch final snapshots include completed nodes and do not close approval stream', () => {
  const replay = makeReplay()
  replay.event('node_start', {node: 'evidence'})
  replay.event('thinking', {node: 'evidence', thinking_type: 'ai_token', content: 'facts'})
  replay.event('node_complete', {node: 'evidence', duration_seconds: 2})
  const final = replay.event('final', {answer: 'report', status: 'partial'})
  assert.equal(final.messages[0].nodeBlocks[0].thinkingTokens, 'facts')
  assert.equal(final.messages[0].nodeBlocks[0].status, 'complete')
  assert.equal(final.messages[0].resultStatus, 'partial')
  assert.equal(final.streaming, true)
  replay.event('remediation_approval_required', {run_id: 'run', approval_id: 'approve', title: 'Review'}, 'query')
  const finished = replay.event('remediation_finished', {run_id: 'run', status: 'skipped', reason: 'no action'})
  assert.equal(finished.answer, 'report')
  assert.equal(finished.messages[0].remediationApprovals.length, 1)
  assert.equal(finished.messages[0].remediationStatus.reason, 'no action')
})

test('parallel model text stays isolated by group and stage without repeated completion', () => {
  const replay = makeReplay()
  replay.event('node_start', {node:'layer'})
  replay.event('node_complete', {node:'layer', state_snapshot:{autonomous_groups:[
    {group_id:'g1', entities:[{kind:'Pod', namespace:'ns', name:'a'}]},
    {group_id:'g2', entities:[{kind:'Pod', namespace:'ns', name:'b'}]},
  ]}})
  replay.event('node_start', {node:'parallel_evidence'})
  for (const [group, stage, kind, content] of [
    ['g1','evidence','ai_token','检查 A'], ['g2','evidence','ai_token','检查 B'],
    ['g1','evidence','ai_message','检查 A'], ['g1','rca','ai_token','A 根因'],
  ]) replay.event('thinking', {node:'parallel_evidence', parallel_group_id:group, lane_stage:stage, thinking_type:kind,content})
  const state = replay.event('final', {answer:'报告'})
  const board = state.blocks.find(b=>b.nodeId==='parallel_evidence').parallelEvidence
  assert.equal(board.groups[0].analysisStreams.evidence.text, '检查 A')
  assert.equal(board.groups[1].analysisStreams.evidence.text, '检查 B')
  assert.equal(board.groups[0].analysisStreams.rca.text, 'A 根因')
  assert.equal(state.blocks.find(b=>b.nodeId==='parallel_evidence').thinkingTokens, '')
  assert.equal(state.messages[0].nodeBlocks.find(b=>b.nodeId==='parallel_evidence').parallelEvidence.groups[1].analysisStreams.evidence.text, '检查 B')
})

test('final retains persisted repair source and structured actions for refresh', () => {
  const replay = makeReplay()
  const record = {run_id:'p1', kind:'plan', source_run_id:'d1'}
  const plan = {targets:[], actions:[{id:'a1', execute_command:'kubectl patch deployment/x -n demo'}]}
  const result = replay.event('final', {answer:'plan', repair_record:record, repair_plan:plan})
  assert.deepEqual(result.messages[0].repairRecord, record)
  assert.deepEqual(result.messages[0].repairPlan, plan)
  assert.equal(result.streaming, true)
})

test('tool call identity, semantic failure, heartbeat and terminal error preserve existing transitions', () => {
  const replay = makeReplay()
  for (const id of ['one', 'two']) replay.event('thinking', {
    node: 'query_collect', thinking_type: 'tool_start', tool_name: 'same', tool_call_id: id,
  })
  const result = replay.event('thinking', {node: 'query_collect', thinking_type: 'tool_result',
    tool_name: 'same', tool_call_id: 'two', status: 'success', semantic_success: false, result_preview: 'denied'})
  assert.equal(result.blocks[0].toolCalls[0].status, 'running')
  assert.equal(result.blocks[0].toolCalls[1].status, 'error')
  const heartbeat = replay.event('heartbeat', {})
  assert.deepEqual(heartbeat.blocks, result.blocks)
  assert.equal(heartbeat.activity, result.activity + 1)
  const failed = replay.event('error', {error: 'failure'})
  assert.equal(failed.streaming, false)
  assert.equal(failed.messages[0].status, 'error')
  assert.equal(failed.blocks[0].status, 'stopped')
})

test('text and malformed JSON append, typed message dispatches and repeated approval upserts', () => {
  const replay = makeReplay()
  replay.event('text', 'plain ')
  assert.equal(replay.event('message', 'not JSON').answer, 'plain not JSON')
  replay.event('message', {type: 'run_start', run_id: 'run'})
  replay.event('remediation_approval_required', {approval_id: 'same', title: 'old'})
  const next = replay.event('remediation_approval_required', {approval_id: 'same', title: 'new'})
  assert.equal(next.messages[0].runId, 'run')
  assert.equal(next.messages[0].remediationApprovals.length, 1)
  assert.equal(next.messages[0].remediationApprovals[0].title, 'new')
})

test('transition clocks and queued updates are deterministic and preserve unrelated messages', () => {
  const state = Object.freeze({nodeBlocks: Object.freeze([]), parallelGroups: Object.freeze([]), textBuffer: '', toolIdCounter: 0})
  const event = {event: 'thinking', data: JSON.stringify({node: 'query_collect',
    thinking_type: 'runtime_status', status: 'running', content: 'waiting'})}
  const first = transitionChatEvent(state, event, 'msg-1', 'ask', 123)
  const second = transitionChatEvent(state, event, 'msg-1', 'ask', 123)
  assert.deepEqual(first.nodeBlocks, second.nodeBlocks)
  assert.equal(first.nodeBlocks[0].runtimeStatus.at, 123)
  const approval = transitionChatEvent(first, {event: 'remediation_approval_required', data: JSON.stringify({
    approval_id: 'a', expires_at: 30, server_time: 20,
  })}, 'msg-1', 'query', 123)
  const messages = Object.freeze([{id: 'other', content: 'untouched'}, {id: 'msg-1', content: 'report'}])
  const updated = approval.messageUpdates.reduce((value, update) => update(value), messages)
  assert.equal(updated[0], messages[0])
  assert.equal(updated[1].content, 'report')
  assert.equal(updated[1].remediationApprovals[0].expiresAt, 10123)
  assert.deepEqual(approval.messageUpdates.reduce((value, update) => update(value), messages), updated)
})

test('typed payload accessors keep the String(a || b || fallback) coercion semantics', () => {
  const data = { empty: '', zero: 0, flag: false, num: 3, name: 'n', id: '  x  ' }
  assert.equal(textField(data, 'missing'), '')
  assert.equal(textField(data, 'zero', 'fb'), 'fb')
  assert.equal(textField(data, 'flag'), '')
  assert.equal(textField(data, 'num'), '3')
  assert.equal(textField(data, ['empty', 'name']), 'n')
  assert.equal(textField(data, ['empty', 'zero'], 'running'), 'running')
  assert.equal(trimmedField(data, 'id'), 'x')
})

const { parseRemediationApprovalText } = await server.ssrLoadModule('/src/components/aiops-chat/remediationParsing.ts')

// Reference for the pre-optimisation behaviour: parse the whole buffer after every chunk.
function legacyTextApprovals(chunks) {
  let text = ''
  let approvals = []
  for (const chunk of chunks) {
    text += chunk
    const parsed = parseRemediationApprovalText(text)
    if (!parsed) continue
    const approval = { ...parsed, requestedAt: 1234 }
    const index = approvals.findIndex(item => item.approvalId === approval.approvalId)
    approvals = index >= 0 ? approvals.map((item, i) => i === index ? { ...item, ...approval } : item) : [...approvals, approval]
  }
  return approvals
}

test('gated text approval parsing yields the same approvals as parsing every chunk', () => {
  const report = '诊断完成。\n修复审批中断\n审批类型：action\n标题：重启 Pod\n'
    + 'curl -X POST http://h/remediation/approve -d run_id=run-1 -d approval_id=appr-1 -d approved=true\n尾部说明'
  for (const size of [1, 2, 3, 5, 8, 13, 400]) {
    const chunks = []
    for (let i = 0; i < report.length; i += size) chunks.push(report.slice(i, i + size))
    const replay = makeReplay()
    let result
    for (const chunk of chunks) result = replay.event('text', chunk)
    assert.equal(result.answer, report)
    assert.deepEqual(result.messages[0].remediationApprovals ?? [], legacyTextApprovals(chunks), `chunk size ${size}`)
  }
})

test('text without an approval marker never parses or records approvals', () => {
  let state = { nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0 }
  for (const chunk of ['run_id=a ', 'approval_id=b ', '/remediation', '-other']) {
    state = transitionChatEvent(state, { event: 'text', data: chunk }, 'msg-1', 'ask', 1)
    assert.equal(state.approvalMarkerSeen, false)
    assert.equal(state.messageUpdates.length, 1)
  }
})

test('final and error transitions are flagged terminal for immediate rendering; streaming events are not', () => {
  const base = { nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0 }
  const token = transitionChatEvent(base, { event: 'thinking', data: JSON.stringify({ node: 'x', thinking_type: 'ai_token', content: 't' }) }, 'm', 'ask', 1)
  assert.equal(token.terminal, undefined)
  assert.equal(transitionChatEvent(base, { event: 'final', data: '{"answer":"a"}' }, 'm', 'ask', 1).terminal, true)
  assert.equal(transitionChatEvent(base, { event: 'message', data: '{"type":"error","error":"e"}' }, 'm', 'ask', 1).terminal, true)
})

const { markStreamInterrupted } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')

test('a stream that closes before final/error is marked interrupted with its node snapshot', () => {
  const replay = makeReplay()
  replay.event('node_start', { node: 'evidence' })
  const running = replay.event('thinking', { node: 'evidence', thinking_type: 'ai_token', content: 'partial' })
  const blocks = running.blocks.map(block => ({ ...block, status: 'stopped' }))
  const interrupted = markStreamInterrupted(running.messages, 'msg-1', blocks)
  assert.equal(interrupted[0].status, 'complete')
  assert.equal(interrupted[0].interrupted, true)
  assert.equal(interrupted[0].nodeBlocks, blocks)
})

test('closing after final or error is not an interruption', () => {
  for (const [event, data] of [['final', { answer: 'done' }], ['error', { error: 'boom' }]]) {
    const replay = makeReplay()
    const ended = replay.event(event, data)
    assert.equal(markStreamInterrupted(ended.messages, 'msg-1', []), ended.messages)
  }
})

test('model stall errors keep the progress and are reported as a model failure', () => {
  const replay = makeReplay()
  replay.event('node_start', { node: 'query_collect' })
  replay.event('thinking', { node: 'query_collect', thinking_type: 'tool_start', tool_name: 'get_series' })
  const ended = replay.event('error', { error: '模型服务停滞：等待模型输出已超过 180 秒', error_code: 'model_stalled' })
  const message = ended.messages[0]
  assert.equal(message.status, 'complete')
  assert.deepEqual(message.modelFailure, { code: 'model_stalled', message: '模型服务停滞：等待模型输出已超过 180 秒' })
  assert.ok(message.nodeBlocks.length > 0)
  assert.equal(ended.answer, '')
  assert.equal(ended.streaming, false)
})

test('errors without a model error code keep the existing error bubble', () => {
  const replay = makeReplay()
  const ended = replay.event('error', { error: 'boom' })
  assert.equal(ended.messages[0].status, 'error')
  assert.equal(ended.messages[0].content, '❌ boom')
  assert.equal(ended.messages[0].modelFailure, undefined)
})

test('model failure banner text does not repeat the title', async () => {
  const { modelFailureText } = await server.ssrLoadModule('/src/components/aiops-chat/sseEvents.ts')
  assert.equal(modelFailureText({ code: 'model_stalled', message: '模型服务停滞：超过 180 秒' }), '模型服务停滞：超过 180 秒')
  assert.equal(modelFailureText({ code: 'model_timeout', message: 'LLM API 服务响应超时' }), '模型服务响应超时：LLM API 服务响应超时')
})

test('reasoning streams on its own channel and never mixes into the analysis', () => {
  const replay = makeReplay()
  replay.event('node_start', { node: 'query_collect' })
  replay.event('thinking', { node: 'query_collect', thinking_type: 'ai_reasoning', content: 'The user wants' })
  replay.event('thinking', { node: 'query_collect', thinking_type: 'ai_reasoning', content: ' node CPU.' })
  const after = replay.event('thinking', { node: 'query_collect', thinking_type: 'ai_token', content: '## 节点资源' })
  const block = after.blocks.find(b => b.nodeId === 'query_collect')
  assert.equal(block.reasoningTokens, 'The user wants node CPU.')
  assert.equal(block.thinkingTokens, '## 节点资源')
})

test('lane reasoning is kept per stage, separate from lane analysis', () => {
  const replay = makeReplay()
  replay.event('node_complete', { node: 'layer', state_snapshot: { autonomous_groups: [
    { group_id: 'g1', entities: [{ kind: 'Pod', namespace: 'a', name: 'p1' }] },
    { group_id: 'g2', entities: [{ kind: 'Pod', namespace: 'a', name: 'p2' }] }] } })
  replay.event('node_start', { node: 'parallel_evidence' })
  const after = replay.event('thinking', { node: 'parallel_evidence', thinking_type: 'ai_reasoning',
    content: 'check logs', parallel_group_id: 'g1', lane_stage: 'evidence' })
  const board = after.blocks.find(b => b.parallelEvidence)?.parallelEvidence
  assert.ok(board, 'parallel evidence board should exist for 2 groups')
  const g1 = board.groups.find(g => g.groupId === 'g1')
  assert.equal(g1.reasoningStreams.evidence, 'check logs')
  assert.equal(g1.analysisStreams, undefined)
})
