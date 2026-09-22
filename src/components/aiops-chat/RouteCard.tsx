import { ThoughtChain } from '@ant-design/x'
import { Tag } from 'antd'
import type { NodeBlock } from './types'
import styles from './MessageList.module.css'

const labels: Record<string, string> = {
  layer: '定位异常', evidence: '采集证据', rca: '分析根因',
  query_collect: '自主查询', conclusion: '整理回答',
  remediation: '修复规划与审查',
  parallel_evidence: '分组并发取证与根因分析',
}

export default function RouteCard({ blocks, terminal }: { blocks: NodeBlock[]; terminal: boolean }) {
  const decision = blocks.find(block => block.routeDecision)?.routeDecision
  if (!decision) return null
  const steps = blocks.some(block => block.nodeId === 'parallel_evidence')
    ? ['layer', 'parallel_evidence', 'conclusion'] : decision.steps
  return <section className={styles.routeCard} aria-label="任务路由">
    <div className={styles.routeTitle}>
      <Tag color={decision.route === 'stop' ? 'error' : decision.route === 'clarify' ? 'warning' : decision.route === 'full_diagnosis' ? 'blue' : 'cyan'}>{decision.title}</Tag>
      <span>{decision.scope}</span>
    </div>
    {decision.errorMessage && <div role="alert" className={styles.routeGoal}>{decision.errorMessage}</div>}
    {decision.outputs.length > 0 && <div className={styles.routeGoal}>回答目标：{decision.outputs.join('；')}</div>}
    {steps.length > 0 && <details className={styles.routePath}>
      <summary>{steps.map(key => labels[key]).join(' → ')}</summary>
      <ThoughtChain items={steps.map(key => {
      const block = blocks.find(item => item.nodeId === key)
      return {
        key, title: labels[key],
        status: block?.status === 'running' ? 'loading' : block?.status === 'complete' ? 'success'
          : block?.status === 'stopped' ? 'abort' : undefined,
        description: block ? (block.status === 'running' ? '正在执行'
          : block.status === 'stopped' ? '已停止' : `已结束${block.toolCalls.length ? ` · ${block.toolCalls.length} 次工具调用` : ''}`) : terminal ? '未执行' : '待执行',
      }
    })} />
    </details>}
    {decision.basis && <details className={styles.routeBasis}>
      <summary>查看范围依据</summary><div>{decision.basis}</div>
    </details>}
  </section>
}
