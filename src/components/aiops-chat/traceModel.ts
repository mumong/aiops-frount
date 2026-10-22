import type { TraceStep } from './types'

// Internal acknowledgement of a structured delivery; never meaningful to the user.
const NOISE = /^\s*(?:结构化结果已生成。?)?\s*$/

function last(trace: TraceStep[], stage?: string): TraceStep | undefined {
  const step = trace[trace.length - 1]
  return step && step.stage === stage ? step : undefined
}

/** Reasoning chunks extend the current thought; a tool call or text closes it. */
export function traceThought(trace: TraceStep[] = [], text: string, stage?: string): TraceStep[] {
  if (!text) return trace
  const tail = last(trace, stage)
  if (tail?.kind === 'thought') return [...trace.slice(0, -1), { ...tail, text: tail.text + text }]
  if (!text.trim()) return trace
  return [...trace, { kind: 'thought', text, ...(stage ? { stage } : {}) }]
}

export function traceTool(trace: TraceStep[] = [], toolId: string, stage?: string): TraceStep[] {
  return [...trace, { kind: 'tool', text: '', toolId, ...(stage ? { stage } : {}) }]
}

/** Visible model text: tokens extend the open text step; a completion message confirms it. */
export function traceText(trace: TraceStep[] = [], kind: 'ai_token' | 'ai_message', text: string,
  stage?: string): TraceStep[] {
  if (!text) return trace
  const tail = last(trace, stage)
  if (kind === 'ai_token') {
    if (tail?.kind === 'text') return [...trace.slice(0, -1), { ...tail, text: tail.text + text }]
    if (!text.trim()) return trace
    return [...trace, { kind: 'text', text, ...(stage ? { stage } : {}) }]
  }
  if (NOISE.test(text)) return trace
  if (tail?.kind === 'text') {
    const streamed = tail.text.trim()
    if (streamed && (text.startsWith(streamed) || streamed.startsWith(text.trim()))) {
      return [...trace.slice(0, -1), { ...tail, text: text.length >= tail.text.length ? text : tail.text }]
    }
    // An empty or acknowledgement-only text step is replaced by the real message.
    if (!streamed || NOISE.test(tail.text)) return [...trace.slice(0, -1), { ...tail, text }]
  }
  return [...trace, { kind: 'text', text, ...(stage ? { stage } : {}) }]
}

/** Text worth showing for a step; empty for whitespace or the internal acknowledgement. */
export function stepText(step: TraceStep): string {
  return NOISE.test(step.text) ? '' : step.text.trim()
}

/** One line for a collapsed row: the latest thing that happened. */
export function latestActivity(trace: TraceStep[] = [], toolName: (id: string) => string): string {
  for (let i = trace.length - 1; i >= 0; i--) {
    const step = trace[i]!
    if (step.kind === 'tool') return `调用 ${toolName(step.toolId || '')}`
    const text = plain(stepText(step))
    if (text) {
      // The newest complete sentence; list numbers and short fragments ("3. 分析") say little.
      const sentences = text.split(/(?<=[。！？!?；;])|\n+/).map(part => part.trim()).filter(part => part.length >= 6 && !/[：:]$/.test(part))
      return sentences[sentences.length - 1] || text.slice(-80)
    }
  }
  return ''
}

/** Markdown markers out of a one-line summary. */
function plain(text: string): string {
  return text.replace(/[`*#>]+/g, '').replace(/^\s*(?:[-+]|\d+[.)])\s+/gm, '').replace(/[ \t]+/g, ' ').trim()
}
