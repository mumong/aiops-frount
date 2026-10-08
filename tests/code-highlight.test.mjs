import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { default: CodeBlock } = await server.ssrLoadModule('/src/components/aiops-chat/CodeBlock.tsx')
const { default: MarkdownReport } = await server.ssrLoadModule('/src/components/aiops-chat/MarkdownReport.tsx')

test('shell highlighting escapes HTML-like command output rather than creating executable markup', () => {
  const code = 'echo "<img src=x onerror=alert(1)>"\n'
  const html = renderToStaticMarkup(React.createElement(CodeBlock, { text: code, language: 'bash' }))
  assert.match(html, /hljs-string/)
  assert.match(html, /&lt;img/)
  assert.doesNotMatch(html, /<img|<script/)
})

test('unknown language falls back to complete escaped text and preserves whitespace', () => {
  const code = '  <untrusted>\n\n    next\n'
  const html = renderToStaticMarkup(React.createElement(CodeBlock, { text: code, language: 'unknown-language' }))
  assert.match(html, /<code> {2}&lt;untrusted&gt;\n\n {4}next\n<\/code>/)
})

test('Markdown fenced YAML receives highlighting and copy controls without rendering raw HTML', () => {
  const html = renderToStaticMarkup(React.createElement(MarkdownReport, {
    content: '```yaml\nresources:\n  memory: 64Mi\n```\n\n<script>alert(1)</script>',
  }))
  assert.match(html, /hljs-attr/)
  assert.match(html, /aria-label="复制内容"/)
  assert.doesNotMatch(html, /<script>/)
})
