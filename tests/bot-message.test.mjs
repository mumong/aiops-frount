import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { default: BotMessage } = await server.ssrLoadModule('/src/components/aiops-chat/BotMessage.tsx')
const { parseHandoff } = await server.ssrLoadModule('/src/components/aiops-chat/handoffParsing.ts')

test('handoff parsing retains nested JSON, escapes, malformed JSON and plain value boundaries', () => {
  const payload = {nested: {text: 'a="b'}}
  assert.deepEqual(parseHandoff(`layer=QUERY payload=${JSON.stringify(payload)} next=hello world`), [
    {key: 'layer', value: 'QUERY', isJson: false},
    {key: 'payload', value: JSON.stringify({nested: {text: 'a="b'}}, null, 2), isJson: true},
    {key: 'next', value: 'hello world', isJson: false},
  ])
  assert.deepEqual(parseHandoff('broken={unfinished'), [{key: 'broken', value: '{unfinished', isJson: true}])
  assert.deepEqual(parseHandoff('ordinary prose'), [])
})

test('completed stage remains expanded and tool and handoff raw details remain initially closed', () => {
  const html = renderToStaticMarkup(React.createElement(BotMessage, {
    message: {id: 'one', role: 'assistant', content: 'report', status: 'complete'},
    nodeBlocks: [{nodeId: 'evidence', nodeName: 'Evidence', status: 'complete',
      thinkingTokens: 'visible analysis', handoffSummary: 'layer=QUERY payload={"a":1}',
      toolCalls: [{id: 'tool', toolName: 'example', status: 'success', resultPreview: 'preview', resultData: 'hidden raw'}]}],
    finalAnswer: 'report', isLatest: true, streamActive: false, activitySeq: 0,
  }))
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /visible analysis/)
  assert.match(html, /preview/)
  assert.doesNotMatch(html, /hidden raw/)
  assert.match(html, /<details>/)
  assert.doesNotMatch(html, /<details open/)
  assert.ok(html.indexOf('visible analysis') < html.indexOf('report'))
})
