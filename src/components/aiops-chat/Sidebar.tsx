import { useState, useEffect } from 'react'
import { ChatSession } from './types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  isOpen: boolean
  onToggle: () => void
}

export default function Sidebar({ sessions, activeId, onSelect, onDelete, onNew, isOpen, onToggle }: SidebarProps) {
  const [aboutExpanded, setAboutExpanded] = useState(false)

  // 无历史会话时自动展开介绍
  useEffect(() => {
    if (sessions.length === 0) setAboutExpanded(true)
  }, [sessions.length])

  if (!isOpen) {
    return (
      <div className={styles.collapsed}>
        <button className={styles.toggleBtn} onClick={onToggle} title="展开侧栏">
          ☰
        </button>
      </div>
    )
  }

  return (
    <div className={styles.sidebar}>
      {/* ── 项目介绍面板 ── */}
      <div className={styles.aboutPanel}>
        <div
          className={styles.aboutHeader}
          onClick={() => setAboutExpanded(e => !e)}
        >
          <span className={styles.aboutTitle}>🤖 k8s aiops 简介说明</span>
          <span className={styles.aboutToggle}>{aboutExpanded ? '▾' : '▸'}</span>
        </div>
        {aboutExpanded && (
          <div className={styles.aboutBody}>
            <p className={styles.aboutDesc}>
              Kubernetes 集群智能运维助手，支持自然语言交互式查询与诊断。
            </p>

            <div className={styles.aboutSection}>
              <div className={styles.aboutSectionTitle}>📊 查询模式</div>
              <p className={styles.aboutSectionText}>
                以问答方式支持基于prometheus的基础查询，
                如cpu使用率，memory内存使用率等。
              </p>
            </div>

            <div className={styles.aboutSection}>
              <div className={styles.aboutSectionTitle}>🔍 诊断模式</div>
              <p className={styles.aboutSectionText}>
                针对常见 Pod 异常状态进行诊断分析，
                Agent 采集 Pod 日志与 K8s 资源信息以及调用bash等其他工具，
                推理分析可能的根因并产出诊断报告以供参考。
                可以分析的异常状态局限于pod异常，如常见的imagepullbackoff、pending、Terminating等。
              </p>
              <p className={styles.aboutExample}>
                例：我的集群 pod 有什么异常？
              </p>
            </div>

            <div className={styles.aboutSection}>
              <div className={styles.aboutSectionTitle}>⚡ 适用范围</div>
              <p className={styles.aboutSectionText}>
                面向 Kubernetes 集群运维场景，
                依赖 Prometheus 指标采集，
                聚焦 Pod 级别异常排查。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 分隔线 ── */}
      <div className={styles.divider} />

      {/* ── 历史会话 ── */}
      <div className={styles.header}>
        <span className={styles.title}>历史会话</span>
        <div className={styles.headerBtns}>
          <button className={styles.newBtn} onClick={onNew} title="新建会话">
            ＋
          </button>
          <button className={styles.toggleBtn} onClick={onToggle} title="收起">
            ✕
          </button>
        </div>
      </div>
      <div className={styles.list}>
        {sessions.length === 0 && (
          <div className={styles.empty}>暂无历史会话</div>
        )}
        {[...sessions].reverse().map(s => (
          <div
            key={s.id}
            className={`${styles.item} ${s.id === activeId ? styles.active : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <div className={styles.itemTitle}>{s.title}</div>
            <div className={styles.itemMeta}>
              <span className={styles.itemDate}>{fmtDate(s.updatedAt)}</span>
              <button
                className={styles.deleteBtn}
                onClick={e => {
                  e.stopPropagation()
                  onDelete(s.id)
                }}
                title="删除会话"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m 前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h 前`
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
