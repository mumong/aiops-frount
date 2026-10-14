import { useState, useCallback, useEffect, useRef } from 'react'
import { ChatSession, ChatMessage, NodeBlock, EndpointMode } from '../components/aiops-chat/types'
import { newChatSessionId } from '../components/aiops-chat/chatRequestPolicy'

const STORAGE_KEY = 'aiops_chat_sessions'
const MAX_PERSISTED_SESSIONS = 20
const SAVE_DEBOUNCE_MS = 500

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((s: ChatSession) => ({ ...s, id: /^[a-f0-9]{32}$/.test(s.id) ? s.id : newChatSessionId() }))
  } catch {
    return []
  }
}

/** Keep the most recently updated sessions (ties favour later entries), preserving stored order. */
export function selectPersistedSessions(sessions: ChatSession[], limit = MAX_PERSISTED_SESSIONS): ChatSession[] {
  if (sessions.length <= limit) return sessions
  const keep = new Set(sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => (b.session.updatedAt - a.session.updatedAt) || (b.index - a.index))
    .slice(0, limit)
    .map(entry => entry.session))
  return sessions.filter(session => keep.has(session))
}

export function saveSessions(sessions: ChatSession[]) {
  try {
    // Bounded to avoid the localStorage quota.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectPersistedSessions(sessions)))
  } catch (error) {
    console.warn('[chat-history] 会话未能保存到 localStorage（可能超出配额）', error)
  }
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string>(() => newChatSessionId())

  // Streaming saves many snapshots per second: debounce writes, flush on leave/unmount.
  const pendingSaveRef = useRef<ChatSession[] | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    pendingSaveRef.current = null
  }, [])
  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current
    cancelPendingSave()
    if (pending) saveSessions(pending)
  }, [cancelPendingSave])

  useEffect(() => {
    pendingSaveRef.current = sessions
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS)
  }, [sessions, flushPendingSave])

  useEffect(() => {
    window.addEventListener('beforeunload', flushPendingSave)
    window.addEventListener('pagehide', flushPendingSave)
    return () => {
      window.removeEventListener('beforeunload', flushPendingSave)
      window.removeEventListener('pagehide', flushPendingSave)
      flushPendingSave()
    }
  }, [flushPendingSave])

  /** Start a brand-new blank session */
  const newSession = useCallback(() => {
    setActiveId(newChatSessionId())
  }, [])

  /** Save by request owner; background completion must never change navigation. */
  const saveSession = useCallback((
    sessionId: string,
    messages: ChatMessage[],
    nodeBlocks: NodeBlock[],
    finalAnswer: string,
    endpointMode: EndpointMode,
  ) => {
    if (messages.length === 0) return

    const userMsg = messages.find(m => m.role === 'user')
    const title = userMsg
      ? userMsg.content.slice(0, 40) + (userMsg.content.length > 40 ? '...' : '')
      : '新对话'

    const now = Date.now()
    const updatedSession: ChatSession = {
      id: sessionId,
      title,
      messages,
      nodeBlocks,
      finalAnswer,
      endpointMode,
      createdAt: now,
      updatedAt: now,
    }

    setSessions(prev => {
      // Update if same id exists, otherwise add
      const idx = prev.findIndex(s => s.id === updatedSession.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...updatedSession, createdAt: prev[idx]!.createdAt }
        return copy
      }
      return [...prev, updatedSession]
    })
  }, [])

  /** Load a session into active view */
  const loadSession = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  /** Delete a session */
  const deleteSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeId === id) {
      const remaining = sessions.filter(s => s.id !== id)
      setActiveId(remaining.length > 0 ? remaining[remaining.length - 1]!.id : newChatSessionId())
    }
  }, [activeId, sessions])

  /** Clear this browser's history and start a fresh session. */
  const clearSessions = useCallback(() => {
    cancelPendingSave()
    setSessions([])
    setActiveId(newChatSessionId())
    saveSessions([])
  }, [cancelPendingSave])

  return {
    sessions,
    activeId,
    newSession,
    saveSession,
    loadSession,
    deleteSession,
    clearSessions,
  }
}
