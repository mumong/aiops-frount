interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
}

const BREAK = /^<br\s*\/?>$/i

/** Models put `<br>` in table cells to break lines (GFM cells cannot hold newlines).
 * Only that exact tag becomes a Markdown hard break; every other raw HTML node is left
 * to react-markdown, which does not render it, so nothing else from the model becomes markup.
 */
export default function remarkLineBreaks() {
  return (tree: MarkdownNode) => {
    const visit = (parent: MarkdownNode) => {
      if (!parent.children) return
      parent.children = parent.children.map(node => {
        if (node.type === 'html' && BREAK.test((node.value || '').trim())) return { type: 'break' }
        visit(node)
        return node
      })
    }
    visit(tree)
  }
}
