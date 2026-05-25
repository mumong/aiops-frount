import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

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
  const source = readFileSync(
    new URL('../src/components/aiops-chat/ChatWidget.tsx', import.meta.url),
    'utf8',
  )

  assert.equal(
    source.includes('setFinalAnswer(finReason)'),
    false,
    'remediation_finished reason should be stored as remediation status, not overwrite finalAnswer',
  )
})

test('chat widget parses text-mode remediation approval interrupts', () => {
  const source = readFileSync(
    new URL('../src/components/aiops-chat/ChatWidget.tsx', import.meta.url),
    'utf8',
  )

  assert.ok(
    source.includes("msg.event === 'text'"),
    'plain text streaming chunks must be handled so text-mode backend approval blocks can show approval controls',
  )
  assert.ok(
    source.includes('parseRemediationApprovalText'),
    'chat widget must parse remediation approval hints from final/text output, not only structured SSE events',
  )
})
