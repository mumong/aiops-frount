import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { default: MarkdownReport } = await server.ssrLoadModule('/src/components/aiops-chat/MarkdownReport.tsx')
const render = content => renderToStaticMarkup(React.createElement(MarkdownReport, { content }))

test('Chinese bold labels next to prose render in paragraphs, lists and tables', () => {
  const html = render('**简要结论：**目前发现异常。\n\n- **其他已见记录：**若干 Pod\n\n| 项目 | 说明 |\n| --- | --- |\n| 内存 | **异常：**超过限制 |')
  assert.match(html, /<strong>简要结论：<\/strong>目前发现异常/)
  assert.match(html, /<li><strong>其他已见记录：<\/strong>若干 Pod/)
  assert.match(html, /<strong>异常：<\/strong>超过限制/)
  assert.match(html, /<table>/)
})

test('standard formatting remains valid and incomplete streaming labels stay literal', () => {
  const html = render('## 检查结果\n\n**正常加粗**，**结论：** 已确认。\n\n**尚未结束：*')
  assert.match(html, /<h3[^>]*>检查结果<\/h3>/)
  assert.match(html, /<strong>正常加粗<\/strong>/)
  assert.match(html, /<strong>结论：<\/strong> 已确认/)
  assert.doesNotMatch(html, /<strong>尚未结束/)
  assert.match(render('**尚未结束：**已完成'), /<strong>尚未结束：<\/strong>已完成/)
})

test('literal stars, inline and fenced code, URLs and raw HTML are not rewritten', () => {
  const literal = render('`**代码：**原样`\n\n```text\n**日志：**原样\n```\n\n\\*\\*转义：\\*\\*原样\n\n[链接](https://example.com/**路径：**原样)\n\n<script>alert(1)</script>')
  assert.doesNotMatch(literal, /<strong>/)
  assert.match(literal, /\*\*代码：\*\*原样/)
  assert.match(literal, /\*\*日志：\*\*原样/)
  assert.match(literal, /\*\*转义：\*\*原样/)
  assert.doesNotMatch(literal, /<script>/)
  assert.match(render('2 ** 3 = 8'), /2 \*\* 3 = 8/)
})
