import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { transitionChatEvent } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')
const { default: BotMessage } = await server.ssrLoadModule('/src/components/aiops-chat/BotMessage.tsx')

function replay() {
  let state = {nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0}
  return (event, data) => {
    state = transitionChatEvent(state, {event, data: JSON.stringify(data)}, 'assistant', 'ask', 123)
    return state
  }
}

function catalog(emit) {
  emit('node_start', {node: 'layer'})
  emit('node_complete', {node: 'layer', state_snapshot: {autonomous_groups: [
    {group_id: 'g1', entities: [{kind: 'Pod', namespace: 'ns', name: 'a'}]},
    {group_id: 'g2', entities: [{kind: 'Pod', namespace: 'ns', name: 'b'}]},
  ]}})
  return emit('node_start', {node: 'parallel_evidence'})
}

test('Layer catalog is consumed by the next parallel stage and structured events route only to its board', () => {
  const emit = replay()
  const initial = catalog(emit)
  assert.equal(initial.nodeBlocks[1].parallelEvidence.groups.length, 2)
  const evidence_context = {group_id: 'g2', entity: {kind: 'Pod', namespace: 'ns', name: 'b'}}
  emit('thinking', {node: 'parallel_evidence', thinking_type: 'tool_start',
    tool_name: 'query', tool_call_id: 'call', evidence_context})
  const next = emit('thinking', {node: 'parallel_evidence', thinking_type: 'tool_result',
    tool_name: 'query', tool_call_id: 'call', evidence_context, result_preview: 'result', status: 'success'})
  assert.equal(next.nodeBlocks[1].toolCalls.length, 0)
  assert.equal(next.nodeBlocks[1].parallelEvidence.groups[1].results.length, 1)
  assert.equal(next.nodeBlocks[1].parallelEvidence.pendingTools.length, 0)
})

test('consecutive final transitions snapshot the latest nodes without mutating earlier state', () => {
  const emit = replay()
  const initial = catalog(emit)
  const saved = JSON.stringify(initial.nodeBlocks)
  emit('thinking', {node: 'parallel_evidence', thinking_type: 'ai_token', content: 'new fact'})
  const next = emit('final', {answer: 'report'})
  let messages = [{id: 'assistant', role: 'assistant', content: '', status: 'streaming'}]
  for (const update of next.messageUpdates) messages = update(messages)
  assert.equal(messages[0].nodeBlocks[1].thinkingTokens, 'new fact')
  assert.equal(messages[0].nodeBlocks[1].status, 'complete')
  assert.equal(JSON.stringify(initial.nodeBlocks), saved)
})

test('multi-group fallback evidence tools are mirrored and unfinished tools survive stage completion', () => {
  const emit = replay()
  catalog(emit)
  emit('node_start', {node: 'evidence'})
  const running = emit('thinking', {node: 'evidence', thinking_type: 'tool_start', tool_name: 'query'})
  assert.equal(running.nodeBlocks[1].parallelEvidence.pendingTools.length, 1)
  assert.equal(running.nodeBlocks[2].toolCalls.length, 1)
  const complete = emit('node_complete', {node: 'evidence'})
  assert.equal(complete.nodeBlocks[1].parallelEvidence.status, 'complete')
  assert.equal(complete.nodeBlocks[1].parallelEvidence.pendingTools.length, 1)
})

test('BotMessage renders the grouped board only when parallel state exists', () => {
  const emit = replay()
  const state = catalog(emit)
  const render = blocks => renderToStaticMarkup(React.createElement(BotMessage, {
    message: {id: 'assistant', role: 'assistant', content: '', status: 'complete'},
    nodeBlocks: blocks, finalAnswer: '', isLatest: true, streamActive: false, activitySeq: 0,
  }))
  const html = render(state.nodeBlocks)
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /ns\/a/)
  assert.match(html, /ns\/b/)
  assert.doesNotMatch(render(state.nodeBlocks.map(block => ({...block, parallelEvidence: undefined}))), /ns\/a/)
})
