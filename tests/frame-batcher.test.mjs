import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/aiops-chat/frameBatcher.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { createFrameBatcher } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function fakeFrames() {
  const queue = new Map()
  let next = 1
  return {
    schedule: callback => { const id = next++; queue.set(id, callback); return id },
    cancel: id => { queue.delete(id) },
    run() { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(callback => callback()) },
    get pending() { return queue.size },
  }
}

test('many requests within a frame flush once', () => {
  const frames = fakeFrames()
  let flushes = 0
  const batcher = createFrameBatcher(() => flushes++, frames.schedule, frames.cancel)
  for (let i = 0; i < 50; i++) batcher.request()
  assert.equal(frames.pending, 1)
  assert.equal(flushes, 0)
  frames.run()
  assert.equal(flushes, 1)
  batcher.request()
  frames.run()
  assert.equal(flushes, 2)
})

test('flushNow renders synchronously and drops the pending frame', () => {
  const frames = fakeFrames()
  let flushes = 0
  const batcher = createFrameBatcher(() => flushes++, frames.schedule, frames.cancel)
  batcher.request()
  batcher.flushNow()
  assert.equal(flushes, 1)
  assert.equal(frames.pending, 0)
  frames.run()
  assert.equal(flushes, 1)
})

test('cancel discards a pending frame without flushing', () => {
  const frames = fakeFrames()
  let flushes = 0
  const batcher = createFrameBatcher(() => flushes++, frames.schedule, frames.cancel)
  batcher.request()
  batcher.cancel()
  frames.run()
  assert.equal(flushes, 0)
  batcher.request()
  assert.equal(frames.pending, 1)
})
