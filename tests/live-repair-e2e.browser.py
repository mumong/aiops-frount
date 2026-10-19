"""Real browser against the deployed UI and backend: diagnose → policy panel → plan → approve → recovery.

This really repairs the target namespace (an anomaly fixture). It drives only what a
human would click: the chat input, the safety panel's rule list,
"生成自动修复方案" and "批准此动作". No cookies or API calls are injected.

  python3 tests/live-repair-e2e.browser.py --url http://10.2.0.48:30081 --chromium /path/to/chrome \
      --namespace aiops-case-04 --screenshot /tmp/live-repair.png
"""
import argparse
import re
import time

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--chromium', required=True)
parser.add_argument('--namespace', required=True)
parser.add_argument('--screenshot', required=True)
parser.add_argument('--diagnosis-timeout', type=int, default=900, help='seconds to wait for the diagnosis to finish')
parser.add_argument('--plan-timeout', type=int, default=600)
parser.add_argument('--recovery-timeout', type=int, default=420)
args = parser.parse_args()
steps = []


def step(name, ok=True, detail=''):
    steps.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL') + ' | ' + name + (' | ' + detail if detail else ''), flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1300})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.url)

    # 1. Diagnose through the chat input (the frontend sends session_id, which binds the repair record).
    page.get_by_label('运维问题').fill(f'诊断 {args.namespace} 命名空间里异常的 Pod 为什么失败')
    page.get_by_role('button', name='发送').click()
    started = time.time()
    generate = page.get_by_role('button', name='生成自动修复方案')
    expect(generate).to_be_visible(timeout=args.diagnosis_timeout * 1000)
    step('诊断完成，报告下出现“生成自动修复方案”入口', detail=f'{int(time.time() - started)}s')

    # 2. Safety panel: posture badge and rule list (command check and mode switch are API-only).
    panel = page.get_by_label('修复安全策略')
    expect(panel).to_contain_text('执行方式', timeout=30000)
    mode_badge = panel.locator('[data-mode]').first
    expect(mode_badge).to_have_text(re.compile('人工审批|自动执行'))
    step('安全面板显示执行方式徽标', detail=mode_badge.inner_text())
    panel.get_by_text('查看拦截规则').click()
    expect(panel).to_contain_text('delete')
    step('拦截规则列表可见（含 delete）')
    # 3. Plan: object, cause, command, risk; then approve in the UI and watch recovery.
    generate.click()
    workspace = page.get_by_label('分组修复方案')
    approve = workspace.get_by_role('button', name='批准此动作')
    expect(approve).to_be_visible(timeout=args.plan_timeout * 1000)
    expect(workspace).to_contain_text('修复对象')
    expect(workspace).to_contain_text('修复命令')
    expect(workspace).to_contain_text('异常原因（来自诊断）')
    expect(workspace).to_contain_text('等待批准')
    step('方案卡片显示修复对象、异常原因、修复命令并等待批准')
    page.screenshot(path=args.screenshot.replace('.png', '-plan.png'), full_page=True)
    approve.click()
    recovery = workspace.get_by_label('执行后恢复观察')
    expect(recovery).to_be_visible(timeout=args.recovery_timeout * 1000)
    outcome = recovery.locator('strong').first.inner_text()
    step('批准后执行并完成恢复观察', '已恢复' in outcome, outcome)
    expect(workspace).to_contain_text('实际执行命令')
    expect(workspace).to_contain_text('审批 ID')
    step('执行事件显示实际命令与审批来源')
    page.screenshot(path=args.screenshot, full_page=True)
    browser.close()

failed = [s for s in steps if not s[1]]
print(f'\n{len(steps) - len(failed)}/{len(steps)} steps passed; page errors: {len(errors)}')
for e in errors[:5]:
    print('  pageerror:', e[:200])
raise SystemExit(1 if failed or errors else 0)
