import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ConfigProvider, theme } from 'antd'

type ThemeMode = 'light' | 'dark'
const ThemeContext = createContext({ mode: 'light' as ThemeMode, toggle: () => {} })

export function WorkspaceTheme({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('aiops_ui_theme')
      if (saved === 'dark' || saved === 'light') return saved
    } catch { /* Theme preference is optional when storage is unavailable. */ }
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = mode
    try { localStorage.setItem('aiops_ui_theme', mode) } catch { /* Keep the in-memory preference. */ }
  }, [mode])
  const value = useMemo(() => ({ mode, toggle: () => setMode(m => m === 'light' ? 'dark' : 'light') }), [mode])
  return <ThemeContext.Provider value={value}>
    <ConfigProvider button={{ autoInsertSpace: false }} theme={{
      algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        colorPrimary: mode === 'dark' ? '#8f9bff' : '#535fd7',
        colorBgContainer: mode === 'dark' ? '#191b22' : '#ffffff',
        colorText: mode === 'dark' ? '#edeef3' : '#242631',
        colorTextSecondary: mode === 'dark' ? '#a7abba' : '#666b7b',
        colorBorderSecondary: mode === 'dark' ? '#30333f' : '#e5e6ed',
        borderRadius: 8,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
      },
    }}>{children}</ConfigProvider>
  </ThemeContext.Provider>
}

export const useWorkspaceTheme = () => useContext(ThemeContext)
