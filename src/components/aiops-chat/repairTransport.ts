export class RepairRequestTimeout extends Error {
  constructor() { super('请求等待超时，提交结果待确认；不会自动重复提交。') }
}

/** A browser timeout never means that the server cancelled a mutation. */
export async function repairJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (init.signal?.aborted) controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const value = await response.json()
    if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : `请求失败 (${response.status})`)
    return value as T
  } catch (error) {
    if (timedOut) throw new RepairRequestTimeout()
    throw error
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}
