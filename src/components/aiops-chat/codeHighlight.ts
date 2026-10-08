import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import json from 'highlight.js/lib/languages/json'
import diff from 'highlight.js/lib/languages/diff'

// Only load the languages used in operational reports. Unknown languages stay plain text.
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('diff', diff)

export function highlightCode(text: string, language?: string): string | undefined {
  if (!language || !hljs.getLanguage(language)) return undefined
  // highlight.js escapes the input before adding its own span markup.
  return hljs.highlight(text, { language, ignoreIllegals: true }).value
}
