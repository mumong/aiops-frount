// Replay a captured /ask SSE stream through the real chat event reducer and print
// what the UI would hold per node (JSON). Used by the backend's multi-cluster
// acceptance (robusta scripts/acceptance/multicluster/e2e_ask.py --phase p5).
//
//   node scripts/replay-sse.mjs events.json
//   events.json: [[event_name, payload], ...] in arrival order
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href)
const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', root, server: { middlewareMode: true } })
try {
  const { transitionChatEvent } = await server.ssrLoadModule('/src/components/aiops-chat/chatEventTransition.ts')
  const events = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  let state = { nodeBlocks: [], parallelGroups: [], textBuffer: '', toolIdCounter: 0 }
  for (const [name, data] of events) {
    state = transitionChatEvent(state, { event: name || 'message', data: JSON.stringify(data) }, 'm', 'ask', 1)
  }
  const nodes = state.nodeBlocks.map(block => ({
    node: block.nodeId,
    status: block.status,
    duration: block.durationSeconds ?? null,
    handoff: (block.handoffSummary || '').slice(0, 120),
    tools: block.toolCalls.length,
    lanes: (block.clusterLanes || []).map(lane => ({
      label: lane.label,
      status: lane.status,
      note: lane.note,
      reasoning: lane.reasoning.length,
      tools: block.toolCalls.filter(tool => tool.clusterLabel === lane.label).length,
    })),
    groups: (block.parallelEvidence?.groups || []).map(group => ({
      id: group.groupId, cluster: group.clusterLabel || '', ended: group.terminalStatus || '', results: group.results.length,
    })),
  }))
  console.log(JSON.stringify({ nodes }))
} finally {
  await server.close()
}
