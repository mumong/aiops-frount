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
    if (kind === 'ai_token') {
      const prefix = block.thinkingStreamStart === undefined && block.thinkingTokens
        ? `${block.thinkingTokens}\n\n` : block.thinkingTokens
      return { ...block, runtimeStatus: undefined, thinkingStreamStart: block.thinkingStreamStart ?? prefix.length,
        thinkingTokens: prefix + content }
    }
    const start = block.thinkingStreamStart
    const streamed = start === undefined ? '' : block.thinkingTokens.slice(start)
    let text = block.thinkingTokens
    if (streamed && (streamed.startsWith(content) || content.startsWith(streamed))) {
      text = text.slice(0, start) + (streamed.length >= content.length ? streamed : content)
    } else {
      text += (text ? '\n\n' : '') + content
    }
    return { ...block, runtimeStatus: undefined, thinkingTokens: text, thinkingStreamStart: undefined }
  })
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
): NodeBlock[] {
  return updateEventNode(blocks, nodeId, nodeName, block => {
    const idx = block.toolCalls.findIndex(
      tool => tool.toolName === toolName && tool.status === 'running',
    )
    if (idx === -1) return block

    const updatedToolCalls = [...block.toolCalls]
    const old = updatedToolCalls[idx]!
    updatedToolCalls[idx] = {
      id: old.id,
      toolName: old.toolName,
      status: status === 'success' ? 'success' : 'error',
      resultPreview,
      resultData,
    }
    return { ...block, toolCalls: updatedToolCalls }
  })
}
