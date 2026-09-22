"""Exercise deployed UI approval after final report, including expiry and payload."""
import argparse
import time
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--url', required=True)
p.add_argument('--chromium', required=True)
args = p.parse_args()
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1200, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script('''
      const original = window.fetch.bind(window);
      window.approvals = [];
      window.questions = [];
      window.fetch = (url, options) => {
        if (String(url).includes('/remediation/approve')) {
          window.approvals.push(String(options.body));
          return Promise.resolve(new Response(JSON.stringify({success:true}), {status:200}));
        }
        if (!/\\/(query|ask)\\?/.test(String(url))) return original(url, options);
        window.questions.push(String(url));
        const stream = new ReadableStream({start(c) {
          window.emit = (event,data) => c.enqueue(new TextEncoder().encode(
            'event: '+event+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));
          window.finish = () => c.close();
        }});
        return Promise.resolve(new Response(stream,{headers:{'content-type':'text/event-stream'}}));
      };
    ''')
    page.goto(args.url)
    page.locator('textarea').fill('帮我修复刚才的 Pod')
    page.get_by_role('button', name='发送').click()
    page.wait_for_function('typeof window.emit === "function"')
    def emit(kind, value):
        page.evaluate('([k,v])=>window.emit(k,v)', [kind, value])
    emit('run_start', {'run_id': 'repair-browser'})
    emit('node_start', {'node': 'request_router'})
    emit('node_complete', {'node': 'request_router', 'state_snapshot': {
        'request_route': 'remediation', 'request_contract': {'scope': 'pod', 'namespaces': ['demo'], 'pod_names': ['api']}}})
    emit('final', {'answer': '## 修复方案\n尚未执行，请审阅命令。', 'run_id': 'repair-browser'})
    def approval(identifier, seconds):
        emit('remediation_approval_required', {'run_id': 'repair-browser', 'approval_id': identifier,
             'approval_kind': 'action', 'title': '调整 demo/api 内存', 'server_time': time.time(),
             'expires_at': time.time()+seconds,
             'payload': {'group_id': 'g1', 'target': {'namespace':'demo','pod':'api'},
                         'risk':'滚动更新期间可能短暂不可用',
                         'execute_command': 'kubectl set resources deployment/api -n demo --limits=memory=256Mi'}})
    approval('expires', 2)
    page.get_by_text('审批剩余', exact=False).wait_for()
    page.locator('pre').filter(has_text='kubectl set resources').first.wait_for()
    page.get_by_text('滚动更新期间可能短暂不可用', exact=True).wait_for()
    page.get_by_text('审批已过期，未授权执行。', exact=True).wait_for(timeout=10000)
    assert page.get_by_role('button', name='✅ 同意', exact=True).is_disabled()
    assert page.evaluate('window.approvals.length') == 0
    approval('approved', 30)
    page.get_by_role('button', name='✅ 同意', exact=True).last.click()
    page.wait_for_function('window.approvals.length === 1')
    page.get_by_text('✅ 已同意', exact=True).wait_for()
    assert 'approval_id=approved' in page.evaluate('window.approvals[0]')
    for group in ['g1', 'g2']:
        emit('remediation_tool_start', {'run_id':'repair-browser', 'group_id':group,
             'action_id':'resize','stage':'execute','status':'running',
             'command':f'kubectl set resources deployment/{group} -n demo --limits=memory=256Mi'})
        page.get_by_text('已提交后端执行，正在等待命令返回。', exact=True).wait_for()
        emit('remediation_tool_result', {'run_id': 'repair-browser', 'group_id': group,
             'action_id': 'resize', 'stage': 'execute', 'status': 'success',
             'command': f'kubectl set resources deployment/{group} -n demo --limits=memory=256Mi',
             'result_preview': f'{group} resource requirements updated', 'result_truncated': group == 'g2'})
        page.get_by_text(f'{group} resource requirements updated', exact=True).wait_for()
    page.get_by_text('返回内容较长，此处仅展示部分结果。', exact=True).wait_for()
    emit('remediation_finished', {'run_id': 'repair-browser', 'status': 'needs_followup', 'reason': '已执行，请复查'})
    page.evaluate('window.finish()')
    page.screenshot(path='/tmp/aiops-repair-execution.png', full_page=True)
    # A deep report without a usable plan offers an explicit follow-up request,
    # not implicit permission or another automatic serial planning call.
    page.get_by_role('button', name='发送').wait_for(state='visible')
    page.locator('textarea').fill('深入诊断 demo/api')
    page.get_by_role('button', name='发送').click()
    page.wait_for_function('window.questions.length === 2')
    emit('run_start', {'run_id': 'deep-browser'})
    emit('node_start', {'node': 'request_router'})
    emit('node_complete', {'node': 'request_router', 'state_snapshot': {
        'request_route': 'full_diagnosis', 'request_contract': {'scope': 'namespace', 'namespaces': ['demo']}}})
    emit('final', {'answer': '## 诊断\n需要进一步核实控制器再制定修复。', 'run_id': 'deep-browser'})
    emit('remediation_finished', {'run_id': 'deep-browser', 'status': 'skipped', 'reason': '无可执行方案'})
    page.evaluate('window.finish()')
    repair_button = page.get_by_role('button', name='生成修复方案并审阅')
    repair_button.wait_for()
    repair_button.scroll_into_view_if_needed()
    page.screenshot(path='/tmp/aiops-repair-entry.png', full_page=True)
    repair_button.click()
    page.wait_for_function('window.questions.length === 3')
    assert page.evaluate('window.approvals.length') == 1
    questions = page.evaluate('window.questions')
    from urllib.parse import urlparse, parse_qs
    previous = parse_qs(urlparse(questions[1]).query)
    followup = parse_qs(urlparse(questions[2]).query)
    assert previous['session_id'] == followup['session_id']
    assert '根据刚才的诊断' in followup['q'][0]
    page.evaluate('window.finish()')
    page.screenshot(path='/tmp/aiops-remediation-review.png', full_page=True)
    assert not errors, errors
    browser.close()
    print('PASS: approval/expiry, execution groups, deep follow-up entry retaining session without approving')
