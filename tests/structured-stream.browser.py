"""Browser replay of streamed text and expandable data; API is mocked."""
import argparse
import json
from playwright.sync_api import sync_playwright, expect

p = argparse.ArgumentParser()
p.add_argument('--url', required=True)
p.add_argument('--chromium', required=True)
args = p.parse_args()
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    for width in [1100, 390]:
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
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
        page.locator('textarea').fill('展示测试')
        page.get_by_role('button', name='发送').click()
        page.wait_for_function('typeof window.emit === "function"')
        def emit(kind, value):
            page.evaluate('([k,v])=>window.emit(k,v)', [kind, value])
        emit('node_start', {'node': 'layer'})
        emit('thinking', {'node':'layer', 'thinking_type':'ai_token', 'content':'<think>正在检查集群。</think>'})
        expect(page.get_by_text('正在检查集群。', exact=True)).to_be_visible()
        raw = json.dumps({'protected_handoff': {'targets': ['pod-a'], 'summary': '证据摘要'}}, ensure_ascii=False)
        for i in range(0, len(raw), 13):
            emit('thinking', {'node':'layer', 'thinking_type':'ai_token', 'content': raw[i:i+13]})
        summary = page.get_by_text('结构化数据', exact=True).first
        expect(summary).to_be_visible()
        assert not page.get_by_text('protected_handoff', exact=True).is_visible()
        summary.click()
        page.locator('summary').filter(has_text='$').click()
        page.locator('summary').filter(has_text='protected_handoff').click()
        expect(page.get_by_text('"证据摘要"', exact=True)).to_be_visible()
        emit('thinking', {'node':'layer','thinking_type':'tool_start','tool_name':'query_pod_lifecycle','tool_call_id':'t1'})
        tools = page.locator('summary').filter(has_text='工具调用 (1)')
        expect(tools).to_be_visible()
        assert not page.get_by_text('query_pod_lifecycle', exact=True).is_visible()
        tools.click()
        expect(page.get_by_text('query_pod_lifecycle', exact=True)).to_be_visible()
        emit('node_complete', {'node':'layer', 'state_snapshot': {'autonomous_groups': [
            {'group_id':'g1','entities':[{'kind':'Pod','namespace':'demo','name':'a'}]},
            {'group_id':'g2','entities':[{'kind':'Pod','namespace':'demo','name':'b'}]},
        ]}})
        emit('node_start', {'node':'parallel_evidence'})
        for group, text in [('g1','准备检查 A 的日志'), ('g2','准备检查 B 的事件')]:
            for chunk in ['<think>', text[:4], text[4:], '</think>']:
                emit('thinking', {'node':'parallel_evidence','parallel_group_id':group,'lane_stage':'evidence','thinking_type':'ai_token','content':chunk})
            expect(page.get_by_label(f'{group} 模型分析').get_by_text(text, exact=True)).to_be_visible()
            emit('thinking', {'node':'parallel_evidence','parallel_group_id':group,'lane_stage':'evidence','thinking_type':'ai_message','full_content':f'<think>{text}</think>'})
            assert page.get_by_label(f'{group} 模型分析').get_by_text(text, exact=True).count() == 1
        assert 'B 的事件' not in page.get_by_label('g1 模型分析').inner_text()
        emit('node_complete', {'node':'parallel_evidence'})
        emit('final', {'answer':'测试完成','run_id':'structured-browser'})
        page.evaluate('window.finish()')
        page.wait_for_timeout(500)
        saved = page.evaluate('JSON.stringify(JSON.parse(localStorage.getItem("aiops_chat_sessions")))')
        assert 'protected_handoff' in saved
        assert '准备检查 A 的日志' in saved and '准备检查 B 的事件' in saved
        assert not errors, errors
        page.screenshot(path=f'/tmp/structured-stream-{width}.png', full_page=True)
        print(f'PASS {width}: streamed text, lazy JSON tree, collapsed tools, original history')
        page.close()
    browser.close()
