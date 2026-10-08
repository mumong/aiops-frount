import { ChatMessage, NodeBlock } from './types'
import MarkdownReport from './MarkdownReport'
import RemediationApprovalCard from './RemediationApprovalCard'
import { getRemediationStatusPresentation } from './remediationStatusPresentation'
import NodeBlockCard from './NodeBlockCard'
import RunProgress from './RunProgress'
import RouteCard from './RouteCard'
import { visibleNarrative } from './handoffPresentation'
import styles from './MessageList.module.css'
import { useRef } from 'react'
import { Box, ArrowDown, FileText, CircleAlert, CheckCircle2, ShieldCheck, Ban } from 'lucide-react'
import CopyButton from './CopyButton'
import CodeBlock from './CodeBlock'

interface BotMessageProps {
  message: ChatMessage
  nodeBlocks: NodeBlock[]
  finalAnswer: string
  isLatest: boolean
  streamActive: boolean
  activitySeq: number
  onRequestRepair?: () => void
  onRemediationRespond?: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<unknown>
}

export default function BotMessage({
  message,
  nodeBlocks,
  finalAnswer,
  isLatest,
  streamActive,
  activitySeq,
  onRemediationRespond,
  onRequestRepair,
}: BotMessageProps) {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const displayedAnswer = visibleNarrative(finalAnswer)
  const answerRef = useRef<HTMLElement>(null)

  return (
    <div className={styles.botRow}>
      <span className={styles.botAvatar} aria-hidden="true"><Box size={18} strokeWidth={1.6} /></span>
      <div className={styles.botContent}>
        <div className={styles.messageHeading}><strong>AIOps Copilot</strong><span>运维助手</span>
          {displayedAnswer && message.status === 'complete' && nodeBlocks.length > 0 && <button type="button" className={styles.answerJump} onClick={() => answerRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })}><ArrowDown size={13} />查看结论</button>}
        </div>
        {/* Error block */}
        {isError ? (
          <div className={`${styles.botBubble} ${styles.errorBubble}`} role="alert">
            <div>{message.content}</div>
          </div>
        ) : (
          <>
            {/* Run ID */}
            {message.runId && (
              <details className={styles.runIdTag}><summary>运行详情</summary>
                <span>run_id: <code>{message.runId}</code></span><CopyButton text={message.runId} label="复制运行 ID" />
              </details>
            )}
            {/* Node blocks — collapsible sections */}
            <RouteCard blocks={nodeBlocks} terminal={!isStreaming} />
            {isStreaming && isLatest && <RunProgress blocks={nodeBlocks} />}
            {message.resultStatus === 'partial' && (
              <div role="status" className={styles.partialNotice}><CircleAlert size={16} />本次仅部分完成；已取得的结果保留，未完成项见报告说明。</div>
            )}
            {nodeBlocks.length > 0 && (
              <div className={styles.nodeBlocksArea}>
                {nodeBlocks.filter(nb => !nb.routeDecision).map((nb, idx, visible) => (
                  <NodeBlockCard
                    key={nb.nodeId || idx}
                    block={nb}
                    isLast={idx === visible.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Streaming indicator when waiting but no content yet */}

            {/* Final markdown report */}
            {displayedAnswer && (message.status === 'complete' || isStreaming) ? (
              <section className={styles.botBubble} ref={answerRef} aria-label="诊断结论">
                <div className={styles.answerHeading}><span><FileText size={15} />{isStreaming ? '正在整理回答' : '分析报告'}</span><CopyButton text={displayedAnswer} label="复制报告" /></div>
                <MarkdownReport content={displayedAnswer} />
              </section>
            ) : null}

            {/* Remediation approval cards */}
            {message.remediationApprovals && message.remediationApprovals.length > 0 && (
              <div className={styles.remediationArea}>
                {message.remediationApprovals.map((ra, idx) => (
                  <RemediationApprovalCard
                    key={ra.approvalId || idx}
                    approval={ra}
                    isCurrent={idx === message.remediationApprovals!.length - 1 && isLatest}
                    streamActive={streamActive}
                    activitySeq={activitySeq}
                    onRespond={(approvalId, approved, reason) => {
                      const runId = ra.runId || message.runId
                      if (onRemediationRespond && runId) {
                        return onRemediationRespond(runId, approvalId, approved, reason)
                      }
                      return Promise.reject(new Error('runId或审批回调未就绪'))
                    }}
                  />
                ))}
              </div>
            )}

            {/* Remediation finished status */}
            {message.remediationResults?.map(result => (
              <details key={result.key} className={`${styles.remediationCard} ${styles.repairResult}`} open>
                <summary>{result.groupId || '修复'} · {result.actionId} · {{ dry_run: '预演', execute: '执行', verify: '验证' }[result.stage] || result.stage} · {{ success: '命令成功', running: '正在执行', failed: '执行失败' }[result.status] || result.status}</summary>
                <CodeBlock text={result.command} language="bash" label="命令" />
                <CodeBlock text={result.result || (result.status === 'running' ? '已提交后端执行，正在等待命令返回。' : '命令未返回正文；请结合验证结果判断。')} label="执行输出" />
                {result.truncated && <div>返回内容较长，此处仅展示部分结果。</div>}
              </details>
            ))}
            {message.remediationStatus && <RemediationStatusCard status={message.remediationStatus} />}
            {isLatest && !streamActive && message.status === 'complete' && displayedAnswer
              && nodeBlocks.some(block => block.routeDecision?.route === 'full_diagnosis')
              && !message.remediationApprovals?.length && !message.remediationResults?.length
              && onRequestRepair && (
                <div className={styles.repairEntry}>
                  <div><strong>下一步 · 修复评估</strong>
                    <p>仅针对证据充分、具备明确操作的故障生成方案。先审阅命令，再决定是否执行。</p></div>
                  <button className={styles.repairPrimary} type="button" onClick={onRequestRepair}><ShieldCheck size={16} />生成修复方案并审阅</button>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

function RemediationStatusCard({ status }: { status: NonNullable<ChatMessage['remediationStatus']> }) {
  const presentation = getRemediationStatusPresentation(status)
  const toneClass =
    presentation.tone === 'failed'
      ? styles.remediationCardFailed
      : presentation.tone === 'blocked'
        ? styles.remediationCardBlocked
        : presentation.tone === 'success'
          ? styles.remediationCardSuccess
          : styles.remediationCardNeutral

  return (
    <div className={`${styles.remediationCard} ${toneClass}`}>
      <div className={styles.remediationHeader}>
        <span className={styles.remediationIcon}>{presentation.tone === 'success' ? <CheckCircle2 size={18} /> : presentation.tone === 'failed' ? <CircleAlert size={18} /> : presentation.tone === 'blocked' ? <Ban size={18} /> : <ShieldCheck size={18} />}</span>
        <span className={styles.remediationLabel}>{presentation.label}</span>
      </div>
      {presentation.detail && (
        <div className={styles.remediationBody}>
          <div className={styles.remediationDesc}>
            {presentation.detail}
          </div>
        </div>
      )}
    </div>
  )
}
