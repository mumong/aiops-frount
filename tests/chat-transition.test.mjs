import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { transitionChatEvent } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')

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
