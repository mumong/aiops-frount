import { createSSEDecoder } from './sseDecoder'
import { useRef, useCallback } from 'react'
import { SSEMessage } from '../components/aiops-chat/types'

/**
 * GET `url?query` and consume the response body as SSE events
 * (or as raw text chunks when the server does not reply with text/event-stream).
 * Returns an abort function.
 */
export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const connect = useCallback((
    url: string,
    query: URLSearchParams | undefined,
    onEvent: (msg: SSEMessage) => void,
    onError: (err: Error) => void,
    /** Body ended. `eventStream` is false for plain-text responses, which have no final event. */
    onComplete: (outcome: { eventStream: boolean }) => void,
  ): (() => void) => {
    // Abort any previous connection
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    const params = query?.toString()
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
          onComplete({ eventStream: false })
          return
        }

        const events = createSSEDecoder(onEvent)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          events.push(value)
        }
        events.finish()

        onComplete({ eventStream: true })
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
