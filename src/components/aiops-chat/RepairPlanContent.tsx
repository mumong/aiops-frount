import type { ChatMessage } from './types'
import CodeBlock from './CodeBlock'
import styles from './RepairWorkspace.module.css'

export default function RepairPlanContent({ plan }: { plan: NonNullable<ChatMessage['repairPlan']> }) {
  return <div className={styles.planContent}>
    {!plan.actions?.length && <article className={styles.action}>
      <strong>{plan.assessments?.some(item => item.status === 'needs_input') ? '待补充依据' : '暂无执行命令'} · 尚未执行</strong>
      {plan.targets?.map(target => <p key={target.group_id} className={styles.target}>
        {target.namespace}/{target.pod}
      </p>)}
      {plan.assessments?.map(item => <div key={item.group_id}>
        <p>{item.missing?.length ? item.missing.join('；') : item.reason}</p>
        {!!item.missing?.length && <details><summary>查看判断依据</summary><p>{item.reason}</p></details>}
      </div>)}
      {!plan.assessments?.length && <p>暂无执行命令，可补充信息后重新生成。</p>}
    </article>}
    {plan.actions?.map((action, index) => {
      const target = plan.targets?.find(item => item.group_id === action.group_id)
      return <article key={action.id} className={styles.action} aria-label={`修复动作 ${index + 1}`}>
        <div className={styles.target}><span>修复对象</span><strong>{target ? `${target.namespace}/${target.pod}` : action.group_id}</strong></div>
        <details className={styles.overview}>
          <summary><span>异常与处理</span><span className={styles.brief}>{action.description}</span><small>展开</small></summary>
          <p>{action.description}</p>
          {action.configuration_change && <p>配置变更：{action.configuration_change}</p>}
        </details>
        <div className={styles.command}><CodeBlock text={action.execute_command} language="bash" label="修复命令" /></div>
        <details className={styles.reviewDetails}>
          <summary>风险、验证与回退 · 批准前请审阅</summary>
          <p>风险：{action.risk || '未提供'}</p>
          {action.dry_run_command && <CodeBlock text={action.dry_run_command} language="bash" label="预演命令" />}
          {action.verify_command && <CodeBlock text={action.verify_command} language="bash" label="验证命令" />}
          <p>恢复条件：{action.verification_conditions?.join('；') || '未提供'}</p>
          <p>回退建议：{action.rollback_advice || '未提供'}</p>
        </details>
      </article>
    })}
  </div>
}
