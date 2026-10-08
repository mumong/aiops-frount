import { createSSEDecoder } from './sseDecoder'
import { useRef, useCallback } from 'react'
import { SSEMessage } from '../components/aiops-chat/types'

/**
 * Consume a ReadableStream from fetch() as SSE events.
 * Returns an abort function.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const connect = useCallback((
    url: string,
    options: { method?: 'GET' | 'POST'; body?: URLSearchParams },
    onEvent: (msg: SSEMessage) => void,
    onError: (err: Error) => void,
    onComplete: () => void,
  ): (() => void) => {
    // Abort any previous connection
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    const params = options.body
      ? options.body.toString()
      : undefined

    const fetchUrl = params ? `${url}?${params}` : url

    const run = async () => {
      try {
        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/event-stream' },
          signal: controller.signal,
        })

        if (!response.ok) {
          onError(new Error(`HTTP ${response.status}: ${response.statusText}`))
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          onError(new Error('Response body is not readable'))
          return
        }

        const decoder = new TextDecoder()
        const contentType = response.headers.get('content-type') || ''

        if (!contentType.includes('text/event-stream')) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            if (chunk) {
              onEvent({ event: 'text', data: chunk })
            }
          }
          const tail = decoder.decode()
          if (tail) {
            onEvent({ event: 'text', data: tail })
          }
          onComplete()
          return
        }

        const events = createSSEDecoder(onEvent)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          events.push(value)
        }
        events.finish()

        onComplete()
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          onError(err)
        }
      }
    }

    run()
    return () => controller.abort()
  }, [])

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  return { connect, disconnect }
}
