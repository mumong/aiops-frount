import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { selectPersistedSessions, saveSessions } = await server.ssrLoadModule('/src/hooks/useChatHistory.ts')

const session = (id, updatedAt) => ({ id, updatedAt, title: id, messages: [], nodeBlocks: [], finalAnswer: '', endpointMode: 'ask', createdAt: 0 })

test('persistence keeps the most recently updated sessions, not the last array positions', () => {
  const sessions = Array.from({ length: 25 }, (_, i) => session(`s${i}`, i))
  sessions[0] = session('s0', 1000) // oldest position, but most recently used
  const kept = selectPersistedSessions(sessions)
  assert.equal(kept.length, 20)
  assert.equal(kept[0].id, 's0')
  assert.deepEqual(kept.slice(1).map(s => s.id), Array.from({ length: 19 }, (_, i) => `s${i + 6}`))
  const small = sessions.slice(0, 3)
  assert.equal(selectPersistedSessions(small), small)
})

test('equal timestamps keep the later entries, matching the previous slice(-20)', () => {
  const sessions = Array.from({ length: 22 }, (_, i) => session(`s${i}`, 5))
  assert.deepEqual(selectPersistedSessions(sessions).map(s => s.id), sessions.slice(-20).map(s => s.id))
})

test('quota errors are reported with console.warn instead of being swallowed', () => {
  const originalStorage = globalThis.localStorage
  const originalWarn = console.warn
  const warnings = []
  globalThis.localStorage = { setItem() { throw new Error('QuotaExceededError') } }
  console.warn = (...args) => warnings.push(args)
  try {
    saveSessions([session('a', 1)])
  } finally {
    globalThis.localStorage = originalStorage
    console.warn = originalWarn
  }
  assert.equal(warnings.length, 1)
  assert.match(String(warnings[0][1]), /QuotaExceededError/)
})
