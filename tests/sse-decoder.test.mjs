import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/hooks/sseDecoder.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { createSSEDecoder: createDecoder } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
)

function decode(chunks) {
  const events = []
  const parser = createDecoder(event => events.push(event))
  for (const chunk of chunks) parser.push(chunk)
  parser.finish()
  return events
}

test('SSE decoding preserves UTF-8 at every byte boundary and multiline data', () => {
  const bytes = new TextEncoder().encode('event: thinking\ndata: 中文\ndata: second\n\ndata: final')
  const expected = [{event: 'thinking', data: '中文\nsecond'}, {event: 'message', data: 'final'}]
  for (let split = 0; split <= bytes.length; split++) {
    assert.deepEqual(decode([bytes.slice(0, split), bytes.slice(split)]), expected)
  }
})

test('comments, id and retry fields are ignored; data without a space is accepted; EOF event-only frames are dropped', () => {
  assert.deepEqual(decode([new TextEncoder().encode(': comment\nid: 7\nretry: 1000\nevent: unused\n\ndata:no-space\n\ndata: value\n\nevent: tail')]), [
    {event: 'message', data: 'no-space'},
    {event: 'message', data: 'value'},
  ])
})

test('only a single leading space is stripped and field without colon is a bare name', () => {
  assert.deepEqual(decode([new TextEncoder().encode('event:x\ndata:  two spaces\ndata\n\n')]), [
    {event: 'x', data: ' two spaces\n'},
  ])
})

test('CRLF, CR and LF line endings are equivalent, including CRLF split across chunks', () => {
  const expected = [{event: 'tick', data: 'one\ntwo'}, {event: 'message', data: 'three'}]
  for (const eol of ['\n', '\r\n', '\r']) {
    const bytes = new TextEncoder().encode(`event: tick${eol}data: one${eol}data: two${eol}${eol}data: three${eol}${eol}`)
    for (let split = 0; split <= bytes.length; split++) {
      assert.deepEqual(decode([bytes.slice(0, split), bytes.slice(split)]), expected, `eol=${JSON.stringify(eol)} split=${split}`)
    }
  }
})

test('an empty data buffer is not dispatched and the event type resets', () => {
  assert.deepEqual(decode([new TextEncoder().encode('event: a\ndata:\n\ndata: b\n\n')]), [
    {event: 'message', data: 'b'},
  ])
})

test('incomplete UTF-8 at EOF is not flushed', () => {
  assert.deepEqual(decode([new Uint8Array([...new TextEncoder().encode('data: x'), 0xe4])]), [
    {event: 'message', data: 'x'},
  ])
})
