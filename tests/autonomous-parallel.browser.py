"""Replay parallel SSE boundaries against a built/deployed frontend."""
import argparse
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--url', required=True)
p.add_argument('--chromium', required=True)
p.add_argument('--screenshot', required=True)
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
    page.locator('textarea').fill('诊断两个 Pod')
    page.get_by_role('button', name='发送').click()
    page.wait_for_function('typeof window.emit === "function"')
    def emit(kind, value):
        page.evaluate('([k,v])=>window.emit(k,v)', [kind,value])
    emit('node_start', {'node':'request_router'})
    emit('node_complete', {'node':'request_router','state_snapshot':{'request_route':'full_diagnosis','request_contract':{'scope':'pod'}}})
    emit('node_start', {'node':'layer'})
    groups = [{'group_id':f'g{i}', 'entities':[{'kind':'Pod','namespace':'demo','name':f'pod-{i}'}]} for i in (1,2)]
    emit('node_complete', {'node':'layer','state_snapshot':{'autonomous_groups':groups}})
    emit('node_start', {'node':'parallel_evidence'})
    page.get_by_label('并发证据采集总览').wait_for()
    assert '2 个异常组' in page.get_by_label('并发证据采集总览').inner_text()
    emit('thinking', {'node':'parallel_evidence','thinking_type':'runtime_status',
         'parallel_group_id':'g1','status':'running','content':'g1 正在整理上下文'})
    emit('thinking', {'node':'parallel_evidence','thinking_type':'runtime_status',
         'parallel_group_id':'g2','status':'running','content':'g2 正在查询指标'})
    assert 'g1 正在整理上下文' in page.get_by_label('并发证据采集总览').inner_text()
    assert 'g2 正在查询指标' in page.get_by_label('并发证据采集总览').inner_text()
    for i in (2,1):
        emit('thinking', {'node':'parallel_evidence','thinking_type':'tool_result',
             'tool_name':'kubectl_describe','tool_call_id':f'call-{i}', 'status':'success',
             'result_preview':f'Pod {i}', 'result':f'raw-{i}',
             'evidence_context':{'group_id':f'g{i}','dimension':'kubernetes','entity':groups[i-1]['entities'][0]}})
    emit('node_complete', {'node':'parallel_evidence','state_snapshot':{'groups':[
        {'group_id':'g1','status':'partial','error':'provider timeout'}, {'group_id':'g2','status':'completed'}]}})
    emit('final', {'answer':'## 两组结果\n\ng1 部分完成；g2 已取得证据。','run_id':'parallel-browser','status':'partial'})
    page.evaluate('window.finish()')
    page.get_by_text('两组结果', exact=True).wait_for()
    board = page.get_by_label('并发证据采集总览')
    assert '部分完成' in board.inner_text()
    assert '分支已结束' in board.inner_text()
    assert '本次仅部分完成' in page.get_by_role('status').last.inner_text()
    assert '分组并发取证与根因分析' in page.get_by_label('任务路由').inner_text()
    page.reload()
    page.get_by_text('诊断两个 Pod', exact=True).first.click()
    assert '部分完成' in page.get_by_label('并发证据采集总览').inner_text()
    assert not errors, errors
    page.screenshot(path=args.screenshot, full_page=True)
    print('PASS: two lanes, out-of-order events, partial failure, route and history persistence')
    browser.close()
