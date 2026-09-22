"""Replay a direct structured query, including streamed JSON and persisted Markdown."""
import argparse
import json
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--url', required=True)
p.add_argument('--chromium', required=True)
args = p.parse_args()
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1100, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script('''
      const original = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (!/\\/(query|ask)\\?/.test(String(url))) return original(url, options);
        const stream = new ReadableStream({start(c) {
          window.emit = (event,data) => c.enqueue(new TextEncoder().encode(
            'event: '+event+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));
          window.finish = () => c.close();
        }});
        return Promise.resolve(new Response(stream, {headers:{'content-type':'text/event-stream'}}));
      };
    ''')
    page.goto(args.url)
    page.locator('textarea').fill('列出 xnet Pod')
    page.get_by_role('button', name='发送').click()
    page.wait_for_function('typeof window.emit === "function"')
    def emit(kind, value):
        page.evaluate('([k,v])=>window.emit(k,v)', [kind, value])
    emit('node_start', {'node': 'request_router'})
    emit('node_complete', {'node': 'request_router', 'state_snapshot': {
        'request_route': 'focused', 'request_contract': {'scope': 'namespace', 'namespaces': ['xnet']}}})
    emit('node_start', {'node': 'query_collect'})
    answer = '## Pod 状态\n\n| Pod | 状态 |\n|---|---|\n| example | Running |'
    raw = json.dumps({'intent': '查询', 'scope': 'xnet', 'status': 'answered', 'answer': answer,
                      'evidence_refs': [], 'runbooks': [], 'missing': []}, ensure_ascii=False)
    for index in range(0, len(raw), 11):
        emit('thinking', {'node': 'query_collect', 'thinking_type': 'ai_token', 'content': raw[index:index+11]})
    page.get_by_role('cell', name='Running').first.wait_for()
    assert '"intent"' not in page.locator('body').inner_text()
    assert '"evidence_refs"' not in page.locator('body').inner_text()
    assert '查询结果整理' not in page.get_by_label('任务路由').inner_text()
    emit('node_complete', {'node': 'query_collect'})
    emit('final', {'answer': answer, 'run_id': 'direct-browser'})
    page.evaluate('window.finish()')
    page.get_by_role('cell', name='Running').first.wait_for()
    # Completion must not automatically collapse the analysis/tool section.
    page.get_by_text('💭 分析说明（按类型汇总，非执行时间线）', exact=True).wait_for()
    header = page.locator('[class*="nodeHeader"]').filter(has_text='自主查询')
    header.click()
    assert not page.get_by_text('💭 分析说明（按类型汇总，非执行时间线）', exact=True).is_visible()
    header.click()
    page.get_by_text('💭 分析说明（按类型汇总，非执行时间线）', exact=True).wait_for()
    page.reload()
    page.get_by_text('列出 xnet Pod', exact=True).first.click()
    page.get_by_role('cell', name='Running').first.wait_for()
    page.get_by_text('💭 分析说明（按类型汇总，非执行时间线）', exact=True).wait_for()
    page.evaluate('window.emit = undefined')
    page.locator('textarea').fill('其中哪个 Pod CPU 最高？')
    page.get_by_role('button', name='发送').click()
    page.wait_for_function('typeof window.emit === "function"')
    failure = {'code': 'model_service', 'title': '模型服务请求失败',
               'message': '理解任务时模型服务返回 HTTP 500。本次已加载会话上下文。尚未启动集群查询。'}
    emit('node_start', {'node': 'request_router'})
    emit('node_complete', {'node': 'request_router', 'state_snapshot': {
        'request_route': 'stop', 'request_contract': None, 'request_error': failure}})
    emit('final', {'status': 'error', 'answer': failure['message'], 'run_id': 'router-error-browser'})
    page.evaluate('window.finish()')
    page.get_by_role('alert').filter(has_text='HTTP 500').wait_for()
    assert '模型服务请求失败' in page.get_by_label('任务路由').last.inner_text()
    assert '任务识别未完成' not in page.get_by_label('任务路由').last.inner_text()
    assert not errors, errors
    print('PASS: direct answer, expanded history, manual collapse, HTTP 500 distinct from clarification')
    browser.close()
