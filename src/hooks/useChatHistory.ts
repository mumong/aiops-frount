import { useState, useCallback, useEffect } from 'react'
import { ChatSession, ChatMessage, NodeBlock, EndpointMode } from '../components/aiops-chat/types'

const STORAGE_KEY = 'aiops_chat_sessions'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    // Only keep last 20 sessions to avoid localStorage limit
    const trimmed = sessions.slice(-20)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full or unavailable – silently skip
  }
}

export function useChatHistory() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string | null>(null)

  // Persist on change
  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  /** Start a brand-new blank session */
  const newSession = useCallback(() => {
    setActiveId(null)
  }, [])

  /** Save the current chat state as a session (called when streaming completes) */
  const saveCurrentSession = useCallback((
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
      id: `${now}`,
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
    setActiveId(updatedSession.id)
  }, [])

  /** Load a session into active view */
  const loadSession = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  /** Delete a session */
  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (activeId === id) {
        setActiveId(filtered.length > 0 ? filtered[filtered.length - 1]!.id : null)
      }
      return filtered
    })
  }, [activeId])

  /** Get the currently active session data */
  const getActiveSession = useCallback((): ChatSession | null => {
    if (!activeId) return null
    return sessions.find(s => s.id === activeId) || null
  }, [activeId, sessions])

  return {
    sessions,
    activeId,
    newSession,
    saveCurrentSession,
    loadSession,
    deleteSession,
    getActiveSession,
  }
}
