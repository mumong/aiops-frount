"""Browser replay without model calls. Requires Python playwright + Chromium.

python tests/diagnosis-layout.browser.py --url http://127.0.0.1:5175 \
  --chromium /path/to/chrome --verify --screenshots /tmp/aiops-layout
Without --verify, measures the old deployment as a regression baseline.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--chromium', required=True)
parser.add_argument('--screenshots', required=True)
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
report = '## 根因与证据\n\nPod `workload-demo` 上一次退出为 **OOMKilled**。\n\n| 维度 | 结果 |\n|---|---|\n| Metrics | 未采集 |\n| Logging | 已采集 |\n| Tracing | 未采集 |'
raw = 'Name: workload-demo\n    Limit: 64Mi\n\n\n    Reason: OOMKilled'
blocks = [
    {'nodeId': 'request_router', 'nodeName': '任务理解', 'status': 'complete',
     'thinkingTokens': '', 'toolCalls': [], 'routeDecision': {
         'route': 'full_diagnosis', 'title': '深度诊断', 'scope': '指定 Pod · demo/workload-demo',
         'basis': '用户指定 workload-demo', 'outputs': ['重启根因'],
         'steps': ['layer', 'evidence', 'rca', 'conclusion']}},
    {'nodeId': 'layer', 'nodeName': '问题定位', 'status': 'complete',
     'thinkingTokens': '\n \n' * 80, 'toolCalls': [], 'handoffSummary': '\n' * 80},
    {'nodeId': 'evidence', 'nodeName': '证据采集', 'status': 'complete',
     'thinkingTokens': '\n' * 80 + '## 已采证据\n\n内存限制 `64Mi`。' + '\n' * 80,
     'toolCalls': [{'id': 'tool1', 'toolName': 'kubectl_describe', 'status': 'success',
                    'resultPreview': 'OOMKilled / Limit 64Mi', 'resultData': raw}],
     'handoffSummary': '\n' * 80 + '## 阶段结论\n\n`FAILURE_MODE=oom_growth`\n\n```yaml\nresources:\n    memory: 64Mi\n\n\n```'},
    {'nodeId': 'rca', 'nodeName': '根因分析', 'status': 'complete',
     'thinkingTokens': '', 'toolCalls': [], 'handoffSummary': report},
    {'nodeId': 'conclusion', 'nodeName': '查询结果整理', 'status': 'complete',
     'thinkingTokens': '', 'toolCalls': []},
]
session = {'id': 'a' * 32, 'title': '诊断展示回放', 'endpointMode': 'query',
           'createdAt': 1, 'updatedAt': 1, 'nodeBlocks': blocks, 'finalAnswer': report,
           'messages': [{'id': 'msg-1', 'role': 'user', 'content': '检查 workload-demo'},
                        {'id': 'msg-2', 'role': 'assistant', 'status': 'complete',
                         'content': report, 'runId': 'layout-replay', 'nodeBlocks': blocks}]}
Path(args.screenshots).mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    for width in (1100, 390):
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('localStorage.setItem("aiops_chat_sessions", ' + json.dumps(json.dumps([session])) + ')')
        page.goto(args.url)
        page.get_by_text('诊断展示回放', exact=True).click()
        toggle = page.get_by_title('收起', exact=True)
        if toggle.count():
            toggle.click()
        page.screenshot(path=str(Path(args.screenshots) / f'collapsed-{width}.png'), full_page=True)
        for title in ('问题定位', '证据采集'):
            header = page.locator('[class*="nodeHeader"]').filter(has_text=title)
            if header.get_attribute('aria-expanded') == 'false':
                header.click()
        panels = page.locator('[class*="nodeAnalysis"], [class*="nodeThinking"]')
        measurements = panels.evaluate_all('(els) => els.map(e => ({height:e.clientHeight, scroll:e.scrollHeight, text:e.textContent.trim()}))')
        page.get_by_text('kubectl_describe', exact=True).click()
        assert page.locator('[class*="toolDetailBody"] code').inner_text() == raw
        summaries = page.locator('summary').filter(has_text='阶段输出')
        for i in range(summaries.count()):
            summaries.nth(i).click()
        assert 'FAILURE_MODE=oom_growth' in page.locator('body').inner_text()
        page.screenshot(path=str(Path(args.screenshots) / f'diagnosis-{width}.png'), full_page=True)
        if args.verify:
            assert page.get_by_label('任务路由').count() == 1
            assert '深度诊断' in page.get_by_label('任务路由').inner_text()
            assert '指定 Pod' in page.get_by_label('任务路由').inner_text()
            assert '未提供单独的分析说明' not in page.locator('body').inner_text()
            assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
            assert len(measurements) == 1, measurements
            assert measurements[0]['scroll'] < 200, measurements
            assert not errors, errors
            assert '等待分析或工具事件' not in page.locator('body').inner_text()
            assert page.locator('[class*="handoffKey"]').count() == 0
            assert page.locator('[class*="nodeHandoff"] pre code').inner_text() == 'resources:\n    memory: 64Mi\n\n\n'
        print(json.dumps({'width': width, 'analysis_panels': measurements, 'browser_errors': errors}, ensure_ascii=False))
        page.close()
    if args.verify:
        page = browser.new_page(viewport={'width': 1100, 'height': 900})
        page.clock.install()
        page.add_init_script('''
          const originalFetch = window.fetch.bind(window);
          window.fetch = (url, options) => {
            if (!/\\/(query|ask)\\?/.test(String(url))) return originalFetch(url, options);
            const stream = new ReadableStream({start(controller) {
              window.emitTestEvent = (event, data) => {
                const body = typeof data === 'string' ? data : JSON.stringify(data);
                const frame = 'event: ' + event + '\\n' + body.split('\\n').map(s => 'data: ' + s).join('\\n') + '\\n\\n';
                controller.enqueue(new TextEncoder().encode(frame));
              };
              window.endTestStream = () => controller.close();
            }});
            return Promise.resolve(new Response(stream, {headers: {'content-type':'text/event-stream'}}));
          };
        ''')
        page.goto(args.url)
        page.locator('textarea').fill('检查 workload-demo')
        page.get_by_role('button', name='发送').click()
        page.wait_for_function('typeof window.emitTestEvent === "function"')
        def emit(event, data):
            page.evaluate('([event,data]) => window.emitTestEvent(event,data)', [event, data])
        emit('node_start', {'node': 'request_router', 'node_name': '任务理解'})
        emit('node_complete', {'node': 'request_router', 'state_snapshot': {
            'request_route': 'full_diagnosis', 'request_contract': {
                'scope': 'pod', 'namespaces': ['demo'], 'pod_names': ['workload-demo'],
                'scope_basis': '用户指定 Pod', 'requested_outputs': ['重启原因']}}})
        page.get_by_label('任务路由').wait_for()
        assert '指定 Pod' in page.get_by_label('任务路由').inner_text()
        emit('node_start', {'node': 'evidence', 'node_name': '证据采集'})
        emit('thinking', {'node': 'evidence', 'thinking_type': 'ai_token', 'content': '\n' * 100})
        # Running analysis is visible without manually expanding its stage.
        assert page.locator('[class*="nodeAnalysis"]').count() == 0
        emit('thinking', {'node': 'evidence', 'thinking_type': 'ai_token', 'content': '## 当前证据\n内存上限 `64Mi`。'})
        page.get_by_text('当前证据', exact=True).wait_for()
        assert page.locator('[class*="nodeAnalysis"]').evaluate('(e) => e.scrollHeight') < 200
        # Long analysis is naturally expanded rather than trapped in a 320px pane.
        emit('thinking', {'node': 'evidence', 'thinking_type': 'ai_token',
                         'content': '\n\n' + '\n\n'.join(f'观察 {i}：保留实际证据及来源。' for i in range(40))})
        page.wait_for_timeout(200)
        panel = page.locator('[class*="nodeAnalysis"]')
        assert panel.evaluate('(e) => getComputedStyle(e).maxHeight') == 'none'
        assert panel.evaluate('(e) => e.clientHeight') > 320
        assert page.get_by_label('运行状态').count() == 1
        assert '等待模型' in page.get_by_label('运行状态').inner_text()
        page.locator('[class*="list_"]').first.evaluate('(e) => { e.scrollTop = 0; e.dispatchEvent(new Event("scroll")); }')
        page.get_by_role('button', name='↓ 回到最新内容').click()
        page.clock.run_for(31000)
        assert '暂无新进展' in page.get_by_label('运行状态').inner_text()
        emit('final', {'answer': report, 'run_id': 'stream-layout-replay'})
        page.evaluate('window.endTestStream()')
        page.get_by_text('根因与证据', exact=True).wait_for()
        assert page.get_by_label('运行状态').count() == 0
        assert '等待分析或工具事件' not in page.locator('body').inner_text()
        page.screenshot(path=str(Path(args.screenshots) / 'stream-completed.png'))
        print('Streaming whitespace → analysis → final report: PASS')
        page.close()
    browser.close()
