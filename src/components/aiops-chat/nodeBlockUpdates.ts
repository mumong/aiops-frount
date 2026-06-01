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

export function startNodeToolCall(
  blocks: NodeBlock[],
  nodeId: string,
  nodeName: string,
  toolCall: ToolCall,
): NodeBlock[] {
  return updateEventNode(blocks, nodeId, nodeName, block => ({
    ...block,
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
