import { useState, useEffect } from 'react'
import { Drawer, Modal, Popconfirm } from 'antd'
import { Box, PanelLeftClose, PanelLeftOpen, Plus, MessageSquare, Trash2, Search, Info, ChevronDown, HardDrive } from 'lucide-react'
import type { ChatSession } from './types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  onNew: () => void
  isOpen: boolean
  onToggle: () => void
  runningIds?: string[]
}

export default function Sidebar({ sessions, activeId, onSelect, onDelete, onClear, onNew, isOpen, onToggle, runningIds = [] }: SidebarProps) {
  const [clearOpen, setClearOpen] = useState(false)
  const [aboutExpanded, setAboutExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const visibleSessions = [...sessions].reverse().filter(session => session.title.toLowerCase().includes(search.toLowerCase()))
  const content = <>
    <div className={styles.brand}>
      <span className={styles.brandIcon}><Box size={21} strokeWidth={1.7} /></span>
      <div><strong>AIOps Copilot</strong><span>Kubernetes 工作空间</span></div>
      {!mobile && <button className={styles.iconButton} onClick={onToggle} title="收起" aria-label="收起侧栏"><PanelLeftClose size={17} /></button>}
    </div>
    <button className={styles.newBtn} onClick={() => { onNew(); if (mobile) onToggle() }} title="新建会话"><Plus size={17} />新建会话</button>
    <div className={styles.sectionLabel}>
      <span>历史会话 · {sessions.length}</span>
      <button className={styles.clearBtn} disabled={sessions.length === 0} aria-label="清空全部历史会话"
        onClick={() => setClearOpen(true)}><Trash2 size={12} />清空全部</button>
    </div>
    {sessions.length > 0 && <label className={styles.search}><Search size={14} /><input aria-label="搜索历史会话" placeholder="搜索会话" value={search} onChange={e => setSearch(e.target.value)} /></label>}
    <nav className={styles.sessionList} aria-label="历史会话">
      {sessions.length === 0 && <div className={styles.empty}><MessageSquare size={22} strokeWidth={1.5} /><p>暂无历史会话</p><span>发送问题后，会话会显示在这里</span></div>}
      {sessions.length > 0 && visibleSessions.length === 0 && <div className={styles.empty}>没有匹配的会话</div>}
      {visibleSessions.map(s => <div key={s.id} className={`${styles.item} ${s.id === activeId ? styles.active : ''}`}>
        <button className={styles.selectSession} onClick={() => onSelect(s.id)} aria-current={s.id === activeId ? 'page' : undefined} title={s.title}>
          <MessageSquare size={14} /><span><span className={styles.itemTitle}>{s.title}</span>{runningIds.includes(s.id)
            ? <span className={styles.runningLabel}>进行中</span>
            : <time className={styles.itemDate} dateTime={new Date(s.updatedAt).toISOString()}>{fmtDate(s.updatedAt)}</time>}</span>
        </button>
        <Popconfirm title="删除这段会话？" description="此浏览器保存的对话记录将被移除。" okText="删除" cancelText="取消" onConfirm={() => onDelete(s.id)}>
          <button className={styles.deleteBtn} title="删除会话" aria-label={`删除会话：${s.title}`}><Trash2 size={14} /></button>
        </Popconfirm>
      </div>)}
    </nav>
    <div className={styles.footer}>
      <button className={styles.aboutHeader} aria-expanded={aboutExpanded} onClick={() => setAboutExpanded(value => !value)}><Info size={15} />使用说明<ChevronDown size={14} style={{ transform: aboutExpanded ? 'rotate(180deg)' : undefined }} /></button>
      {aboutExpanded && <div className={styles.aboutBody}>
        <p>查询集群指标，排查 Pod 异常。</p>
        <strong>指标查询</strong><p>基于 Prometheus 查询 CPU、内存等指标。</p>
        <strong>异常排查</strong><p>结合日志、事件和资源状态排查问题，包括镜像拉取失败、等待调度和终止卡住。</p>
        <strong>适用范围</strong><p>指标查询依赖 Prometheus。检查范围见结果说明，修复操作须经审批。</p>
      </div>}
      <div className={styles.storageNote}><HardDrive size={13} />会话保存在当前浏览器</div>
    </div>
  </>
  return <>
    <Modal title="清空全部历史会话？" zIndex={1200} open={clearOpen} okText="确认清空" cancelText="取消"
      okButtonProps={{ danger: true }} onCancel={() => setClearOpen(false)}
      onOk={() => { onClear(); setSearch(''); setClearOpen(false) }}>
      <p>将删除当前浏览器中的全部 {sessions.length} 段会话及草稿，清空后无法恢复。</p>
      {runningIds.length > 0 && <p>有 {runningIds.length} 段会话仍在运行，清空将断开这些会话的前端连接，不再接收结果；后台任务可能继续执行。</p>}
    </Modal>
    {(!isOpen || mobile) && <div className={styles.collapsed}>
      <button className={styles.iconButton} onClick={onToggle} title="展开侧栏" aria-label="展开侧栏"><PanelLeftOpen size={19} /></button>
      <button className={styles.iconButton} onClick={onNew} title="新建会话" aria-label="新建会话"><Plus size={19} /></button>
    </div>}
    {mobile ? <Drawer title="工作空间" open={isOpen} onClose={onToggle} placement="left" size={280}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', background: 'var(--sidebar)' } }}>{content}</Drawer>
      : isOpen && <aside className={styles.sidebar} aria-label="工作空间导航">{content}</aside>}
  </>
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
