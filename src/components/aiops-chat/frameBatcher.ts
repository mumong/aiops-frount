/**
 * Coalesces many `request()` calls into one `flush()` per animation frame.
 * `flushNow()` runs a pending (or forced) flush synchronously, so terminal
 * events and teardown never lose the last update. Scheduler is injectable for tests.
 */
export function createFrameBatcher(
  flush: () => void,
  schedule: (callback: () => void) => number = callback => requestAnimationFrame(callback),
  cancelScheduled: (handle: number) => void = handle => cancelAnimationFrame(handle),
) {
  let handle: number | null = null
  const cancel = () => {
    if (handle === null) return
    cancelScheduled(handle)
    handle = null
  }
  return {
    request() {
      if (handle !== null) return
      handle = schedule(() => {
        handle = null
        flush()
      })
    },
    flushNow() {
      cancel()
      flush()
    },
    cancel,
  }
}
