import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const chatWidgetSource = readFileSync(
  new URL('../src/components/aiops-chat/ChatWidget.tsx', import.meta.url),
  'utf8',
)
const botMessageSource = readFileSync(
  new URL('../src/components/aiops-chat/BotMessage.tsx', import.meta.url),
  'utf8',
)

test('ChatWidget consumes the Layer catalog and routes parallel evidence tool events', () => {
  assert.match(chatWidgetSource, /extractParallelEvidenceGroups/)
  assert.match(chatWidgetSource, /createParallelEvidenceState/)
  assert.match(chatWidgetSource, /startParallelTool/)
  assert.match(chatWidgetSource, /finishParallelTool/)
  assert.match(chatWidgetSource, /completeParallelEvidence/)
  assert.match(chatWidgetSource, /parallelGroupsRef/)
})

test('ChatWidget synchronously updates the node ref used by the final snapshot', () => {
  assert.match(chatWidgetSource, /const updateNodeBlocks = useCallback/)
  assert.match(chatWidgetSource, /nodeBlocksRef\.current = next/)
  assert.doesNotMatch(chatWidgetSource, /setNodeBlocks\(prev => startNodeBlock/)
})

test('multi-group runs mirror fallback evidence-node tools into the grouped board', () => {
  assert.match(chatWidgetSource, /mirrorParallelEvidence/)
  assert.match(chatWidgetSource, /shouldRouteOnlyToParallelBoard/)
  assert.match(chatWidgetSource, /nodeId === 'evidence'/)
  assert.match(chatWidgetSource, /parallelGroupsRef\.current\.length > 2/)
})

test('BotMessage renders the grouped board only when parallel state exists', () => {
  assert.match(botMessageSource, /ParallelEvidenceBoard/)
  assert.match(botMessageSource, /block\.parallelEvidence/)
  assert.match(botMessageSource, /block\.nodeId === 'parallel_evidence'/)
})
