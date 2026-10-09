import { useState, useCallback, useRef } from 'react'
import type { ChatSession } from './types'
import { useChatHistory } from '../../hooks/useChatHistory'
import Sidebar from './Sidebar'
import ChatSessionPanel from './ChatSessionPanel'
import styles from './ChatWidget.module.css'

export interface ChatWidgetProps {
  apiBase: string
  title?: string
  placeholder?: string
  maxMessages?: number
}

export default function ChatWidget({ apiBase, title = 'k8s aiops', maxMessages = 50 }: ChatWidgetProps) {
  const history = useChatHistory()
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 640px)').matches)
  const [runningSessions, setRunningSessions] = useState<Record<string, ChatSession>>({})
  const drafts = useRef(new Map<string, string>())

  const handleStart = useCallback((session: ChatSession) => {
    setRunningSessions(previous => ({ ...previous, [session.id]: session }))
  }, [])
  const handleFinish = useCallback((id: string) => {
    setRunningSessions(previous => {
      if (!(id in previous)) return previous
      const next = { ...previous }
      delete next[id]
      return next
    })
  }, [])
  const handleDraftChange = useCallback((id: string, text: string) => {
    drafts.current.set(id, text)
  }, [])
  const handleLoadSession = (id: string) => {
    history.loadSession(id)
    if (window.matchMedia('(max-width: 640px)').matches) setSidebarOpen(false)
  }
  const handleDeleteSession = (id: string) => {
    // Removing its panel also aborts only this session's transport.
    handleFinish(id)
    drafts.current.delete(id)
    history.deleteSession(id)
  }

  const handleClearSessions = () => {
    // Unmount every old panel to disconnect streams and invalidate late callbacks.
    setRunningSessions({})
    drafts.current.clear()
    history.clearSessions()
    if (window.matchMedia('(max-width: 640px)').matches) setSidebarOpen(false)
  }

  const listed = new Map(history.sessions.map(session => [session.id, session]))
  for (const session of Object.values(runningSessions)) listed.set(session.id, session)
  // Keep live panels mounted so their SSE, approvals and local UI state survive navigation.
  // Completed inactive panels can unmount; their snapshots live in the existing history schema.
  const mountedIds = [...new Set([...Object.keys(runningSessions), history.activeId])]

  return <div className={styles.widget}>
    <div className={styles.body}>
      <Sidebar sessions={[...listed.values()]} activeId={history.activeId}
        onSelect={handleLoadSession} onDelete={handleDeleteSession} onClear={handleClearSessions} onNew={history.newSession}
        isOpen={sidebarOpen} onToggle={() => setSidebarOpen(open => !open)}
        runningIds={Object.keys(runningSessions)} />
      {mountedIds.map(id => <ChatSessionPanel key={id}
        sessionId={id} initialSession={listed.get(id)} initialDraft={drafts.current.get(id) || ''}
        active={id === history.activeId} apiBase={apiBase} title={title} maxMessages={maxMessages}
        onStart={handleStart} onFinish={handleFinish} onSave={history.saveSession}
        onDraftChange={handleDraftChange} />)}
    </div>
  </div>
}
