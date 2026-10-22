import type { ClusterLane, NodeBlock, ToolCall } from './types'
import { mergeAnalysisStream, startNodeBlock } from './nodeBlockUpdates'
import { traceText, traceThought, traceTool } from './traceModel'

/** Events of one cluster's location run carry ``cluster_lane``; they update that cluster's card. */
function updateLane(
  blocks: NodeBlock[],
  nodeId: string,
  label: string,
  fn: (lane: ClusterLane) => ClusterLane,
): NodeBlock[] {
  const present = blocks.some(block => block.nodeId === nodeId)
  return (present ? blocks : startNodeBlock(blocks, nodeId, nodeId)).map(block => {
    if (block.nodeId !== nodeId) return block
    const lanes = block.clusterLanes || []
    const existing = lanes.find(lane => lane.label === label)
    const lane = fn(existing || { label, status: 'running', note: '', reasoning: '', analysis: { text: '' } })
    return { ...block, clusterLanes: existing
      ? lanes.map(item => item.label === label ? lane : item)
      : [...lanes, lane] }
  })
}

export function setClusterLaneStatus(blocks: NodeBlock[], nodeId: string, label: string,
  status: string, note: string): NodeBlock[] {
  const next: ClusterLane['status'] = status === 'complete' ? 'complete'
    : status === 'failed' ? 'failed' : 'running'
  return updateLane(blocks, nodeId, label, lane => ({ ...lane, status: next, note }))
}

export function appendClusterLaneReasoning(blocks: NodeBlock[], nodeId: string, label: string,
  content: string): NodeBlock[] {
  return updateLane(blocks, nodeId, label, lane => ({
    ...lane, reasoning: lane.reasoning + content, trace: traceThought(lane.trace, content),
  }))
}

export function appendClusterLaneAnalysis(blocks: NodeBlock[], nodeId: string, label: string,
  kind: 'ai_token' | 'ai_message', content: string): NodeBlock[] {
  return updateLane(blocks, nodeId, label, lane => ({
    ...lane, analysis: mergeAnalysisStream(lane.analysis, kind, content),
    trace: traceText(lane.trace, kind, content),
  }))
}

export function traceClusterLaneTool(blocks: NodeBlock[], nodeId: string, label: string,
  toolId: string): NodeBlock[] {
  return updateLane(blocks, nodeId, label, lane => ({ ...lane, trace: traceTool(lane.trace, toolId) }))
}

export function laneTools(block: NodeBlock, label: string): ToolCall[] {
  return block.toolCalls.filter(tool => tool.clusterLabel === label)
}
