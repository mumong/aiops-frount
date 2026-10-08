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

test('legacy SSE decoder ignores comments and fields without a space, including EOF event-only frames', () => {
  assert.deepEqual(decode([new TextEncoder().encode(': comment\nevent: unused\n\ndata:no-space\n\ndata: value\n\nevent: tail')]), [
    {event: 'message', data: 'value'},
  ])
})

test('legacy CRLF and incomplete UTF-8 behavior is retained rather than broadened during extraction', () => {
  assert.deepEqual(decode([new TextEncoder().encode('event: tick\r\ndata: one\r\n\r\ndata: two\r\n\r\n')]), [
    {event: 'tick', data: 'one\r\ntwo\r'},
  ])
  assert.deepEqual(decode([new Uint8Array([...new TextEncoder().encode('data: x'), 0xe4])]), [
    {event: 'message', data: 'x'},
  ])
})
