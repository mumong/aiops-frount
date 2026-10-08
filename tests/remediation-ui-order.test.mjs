import { readFileSync } from 'node:fs'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { transitionChatEvent } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')

test('remediation approval cards render after the final markdown report', () => {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/BotMessage.tsx', import.meta.url),
    'utf8',
  )

  const finalReportIndex = source.indexOf('{/* Final markdown report */}')
  const approvalCardsIndex = source.indexOf('{/* Remediation approval cards */}')

  assert.notEqual(finalReportIndex, -1)
  assert.notEqual(approvalCardsIndex, -1)
  assert.ok(
    approvalCardsIndex > finalReportIndex,
    'approval controls must appear below the long final report so they stay visible when the stream waits for approval',
  )
})

test('remediation finished status renders after the final markdown report', () => {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/BotMessage.tsx', import.meta.url),
    'utf8',
  )

  const finalReportIndex = source.indexOf('{/* Final markdown report */}')
  const remediationStatusIndex = source.indexOf('{/* Remediation finished status */}')

  assert.notEqual(finalReportIndex, -1)
  assert.notEqual(remediationStatusIndex, -1)
  assert.ok(
    remediationStatusIndex > finalReportIndex,
    'remediation finished status must appear below the final report instead of replacing it',
  )
})

test('remediation finished status renders after approval controls', () => {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/BotMessage.tsx', import.meta.url),
    'utf8',
  )

  const approvalCardsIndex = source.indexOf('{/* Remediation approval cards */}')
  const remediationStatusIndex = source.indexOf('{/* Remediation finished status */}')

  assert.notEqual(approvalCardsIndex, -1)
  assert.notEqual(remediationStatusIndex, -1)
  assert.ok(
    remediationStatusIndex > approvalCardsIndex,
    'final remediation status should appear below the approval card after the operator responds',
  )
})

test('remediation finished does not replace the final report content', () => {
  const next = transitionChatEvent({nodeBlocks: [], parallelGroups: [], textBuffer: 'report', toolIdCounter: 0},
    {event: 'remediation_finished', data: JSON.stringify({reason: 'finished'})}, 'assistant', 'ask', 100)
  assert.equal(next.finalAnswer, undefined)
  assert.equal(next.textBuffer, 'report')
})

test('chat widget parses text-mode remediation approval interrupts', () => {
  const text = '修复审批中断\n标题: Review\ncurl /remediation/approve -d run_id=run -d approval_id=approval'
  const next = transitionChatEvent({nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0},
    {event: 'text', data: text}, 'assistant', 'query', 100)
  let messages = [{id: 'assistant', role: 'assistant', content: ''}]
  for (const update of next.messageUpdates) messages = update(messages)
  assert.equal(messages[0].content, text)
  assert.equal(messages[0].remediationApprovals[0].approvalId, 'approval')
  assert.equal(messages[0].remediationApprovals[0].requestedAt, 100)
})
