import type { NodeBlock, ToolCall } from './types'

function createNodeBlock(nodeId: string, nodeName: string): NodeBlock {
  return {
    nodeId,
    nodeName,
    status: 'running',
    thinkingTokens: '',
    toolCalls: [],
  }
}

function resolveNodeIdentity(nodeId: string, nodeName: string) {
  const id = nodeId || nodeName
  const name = nodeName || nodeId
  return { id, name }
}

function updateLastNode(blocks: NodeBlock[], fn: (block: NodeBlock) => NodeBlock): NodeBlock[] {
  if (blocks.length === 0) return blocks
  const copy = blocks.slice()
  copy[copy.length - 1] = fn(copy[copy.length - 1]!)
  return copy
}

function updateEventNode(
  blocks: NodeBlock[],
  nodeId: string,
  nodeName: string,
  fn: (block: NodeBlock) => NodeBlock,
): NodeBlock[] {
  const { id, name } = resolveNodeIdentity(nodeId, nodeName)
  if (!id) return updateLastNode(blocks, fn)

  let found = false
  const updated = blocks.map(block => {
    if (block.nodeId !== id) return block
    found = true
    return fn(block)
  })

  if (found) return updated
  return [...updated, fn(createNodeBlock(id, name))]
}

export function startNodeBlock(blocks: NodeBlock[], nodeId: string, nodeName: string): NodeBlock[] {
  const { id, name } = resolveNodeIdentity(nodeId, nodeName)
  if (!id) return blocks
  if (blocks.some(block => block.nodeId === id && block.status === 'running')) return blocks
  return [...blocks, createNodeBlock(id, name)]
}

export function setNodeRuntimeStatus(blocks: NodeBlock[], nodeId: string, nodeName: string,
  text: string, status: string, at = Date.now()): NodeBlock[] {
  return updateEventNode(blocks, nodeId, nodeName, block => ({
    ...block, runtimeStatus: { text, status, at },
  }))
}

export function settleNodeBlocks(blocks: NodeBlock[], status: 'complete' | 'stopped'): NodeBlock[] {
  return blocks.map(block => ({ ...block, runtimeStatus: undefined,
    status: block.status === 'running' ? status : block.status }))
}

export function appendNodeThinking(
  blocks: NodeBlock[],
  nodeId: string,
  nodeName: string,
  content: string,
  separator = '',
): NodeBlock[] {
  return updateEventNode(blocks, nodeId, nodeName, block => ({
    ...block,
    thinkingTokens: block.thinkingTokens
      ? `${block.thinkingTokens}${separator}${content}`
      : content,
  }))
}

// A completion event confirms the active stream, rather than adding a second
// copy. Older backends send only a 500-character completion preview.
export function applyNodeThinkingEvent(
  blocks: NodeBlock[], nodeId: string, nodeName: string,
  kind: 'ai_token' | 'ai_message', content: string,
): NodeBlock[] {
  if (!content) return blocks
  return updateEventNode(blocks, nodeId, nodeName, block => {
    const next = mergeAnalysisStream({ text: block.thinkingTokens, streamStart: block.thinkingStreamStart }, kind, content)
    return { ...block, runtimeStatus: undefined, thinkingTokens: next.text, thinkingStreamStart: next.streamStart }
  })
}

export function mergeAnalysisStream(previous: { text: string; streamStart?: number } | undefined,
  kind: 'ai_token' | 'ai_message', content: string): { text: string; streamStart?: number } {
  const { text = '', streamStart } = previous || {}
  if (!content) return { text, streamStart }
  if (kind === 'ai_token') {
    const prefix = streamStart === undefined && text ? `${text}\n\n` : text
    return { text: prefix + content, streamStart: streamStart ?? prefix.length }
  }
  const streamed = streamStart === undefined ? '' : text.slice(streamStart)
  if (streamed && (streamed.startsWith(content) || content.startsWith(streamed))) {
    return { text: text.slice(0, streamStart) + (streamed.length >= content.length ? streamed : content) }
  }
  return { text: text + (text ? '\n\n' : '') + content }
}

export function startNodeToolCall(
  blocks: NodeBlock[],
  nodeId: string,
  nodeName: string,
  toolCall: ToolCall,
): NodeBlock[] {
  return updateEventNode(blocks, nodeId, nodeName, block => ({
    ...block,
    runtimeStatus: undefined,
    toolCalls: [...block.toolCalls, toolCall],
  }))
}

export function finishNodeToolCall(
  blocks: NodeBlock[],
  nodeId: string,
  nodeName: string,
  toolName: string,
  status: string,
  resultPreview: string,
  resultData: string,
  backendCallId?: string,
): NodeBlock[] {
  return updateEventNode(blocks, nodeId, nodeName, block => {
    const idx = block.toolCalls.findIndex(
      tool => backendCallId ? tool.backendCallId === backendCallId
        : tool.toolName === toolName && tool.status === 'running',
    )
    if (idx === -1) return { ...block, toolCalls: [...block.toolCalls, {
      id: backendCallId || `result-${block.toolCalls.length}`,
      backendCallId, toolName, status: status === 'success' ? 'success' : 'error',
      resultPreview, resultData,
    }] }

    const updatedToolCalls = [...block.toolCalls]
    const old = updatedToolCalls[idx]!
    updatedToolCalls[idx] = {
      ...old,
      toolName: old.toolName,
      status: status === 'success' ? 'success' : 'error',
      resultPreview,
      resultData,
    }
    return { ...block, toolCalls: updatedToolCalls }
  })
}
