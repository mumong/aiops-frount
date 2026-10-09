interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
}

/** Repair complete Chinese bold labels that CommonMark leaves as literal text.
 * Runs after parsing so code, HTML and URLs remain untouched. Source data is not changed.
 */
export default function remarkChineseStrong() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value)
    const visit = (parent: MarkdownNode) => {
      if (!parent.children) return
      parent.children = parent.children.flatMap(node => {
        if (node.type !== 'text' || !node.value) {
          visit(node)
          return [node]
        }
        const raw = source.slice(node.position?.start.offset, node.position?.end.offset)
        // Explicitly escaped stars are literal author intent, not formatting.
        if (raw.includes('\\*')) return [node]
        const result: MarkdownNode[] = []
        const pattern = /(?<!\*)\*\*([^*\n]+[：，。；！？、）】》」』])\*\*(?!\*)/gu
        let end = 0
        for (const match of node.value.matchAll(pattern)) {
          const label = match[1]
          if (!label || !/\p{Script=Han}/u.test(label)) continue
          if (match.index > end) result.push({ type: 'text', value: node.value.slice(end, match.index) })
          result.push({ type: 'strong', children: [{ type: 'text', value: label }] })
          end = match.index + match[0].length
        }
        if (!end) return [node]
        if (end < node.value.length) result.push({ type: 'text', value: node.value.slice(end) })
        return result
      })
    }
    visit(tree)
  }
}
