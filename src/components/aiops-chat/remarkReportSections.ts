interface MarkdownNode {
  type: string
  depth?: number
  value?: string
  children?: MarkdownNode[]
  data?: { hName?: string, hProperties?: Record<string, string> }
}

export type SectionTone = 'conclusion' | 'cause' | 'overview'

/** Section titles of the AIOps report template (robusta prompts.py DiagnosisCaseOutput.report
 * and case_report.py). A matching section becomes a highlighted card; every other heading
 * still gets its own section, so any Markdown reads as a clear hierarchy.
 */
const TONES: Array<[RegExp, SectionTone]> = [
  [/^(诊断结论|结论|简要结论)/, 'conclusion'],
  [/^(原因分析|根因|根本原因)/, 'cause'],
  [/^诊断总览/, 'overview'],
]

function text(node: MarkdownNode): string {
  if (node.value) return node.value
  return (node.children || []).map(text).join('')
}

export function sectionTone(title: string): SectionTone | undefined {
  const plain = title.trim()
  return TONES.find(([pattern]) => pattern.test(plain))?.[1]
}

function isBoundary(node: MarkdownNode | undefined, depth: number): boolean {
  return node?.type === 'heading' && (node.depth || 9) <= depth
}

function group(nodes: MarkdownNode[]): MarkdownNode[] {
  const out: MarkdownNode[] = []
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index] as MarkdownNode
    if (node.type !== 'heading' || (node.depth || 0) > 3) {
      out.push(node)
      index += 1
      continue
    }
    const depth = node.depth || 1
    let end = index + 1
    while (end < nodes.length && !isBoundary(nodes[end], depth)) end += 1
    const tone = sectionTone(text(node))
    const className = ['reportSection', `reportLevel${depth}`, tone ? `reportTone_${tone}` : ''].filter(Boolean).join(' ')
    out.push({
      type: 'reportSection',
      data: { hName: 'section', hProperties: { className, ...(tone ? { 'data-tone': tone } : {}) } },
      children: [node, ...group(nodes.slice(index + 1, end))],
    })
    index = end
  }
  return out
}

/** Wrap each `#`/`##`/`###` heading and the content under it into a `<section>`, nested by level. */
export default function remarkReportSections() {
  return (tree: MarkdownNode) => {
    tree.children = group(tree.children || [])
  }
}
