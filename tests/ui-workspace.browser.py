"""UI acceptance using local fixtures only; never calls the real AIOps backend.

Covers theme persistence, responsive layout, keyboard/IME input, history controls,
copy feedback, preserved raw output, approval rejection/failure, and screenshots.
Existing browser replays cover protocol transitions and post-final execution.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--chromium', required=True)
parser.add_argument('--screenshots', required=True)
args = parser.parse_args()
out = Path(args.screenshots)
out.mkdir(parents=True, exist_ok=True)

MOCK = r'''
window.requests = [];
window.approvals = [];
window.failApproval = false;
window.failCopy = false;
Object.defineProperty(navigator, 'clipboard', {value: {
  writeText: async text => { if(window.failCopy) throw Error('denied'); window.copied = text; }
}});
// HTTP NodePort origins use the existing textarea/execCommand fallback.
const originalExecCommand = document.execCommand.bind(document);
document.execCommand = (command, ...args) => {
  if (command !== 'copy') return originalExecCommand(command, ...args);
  if (window.failCopy) return false;
  const value = document.activeElement?.value;
  const copied = originalExecCommand(command, ...args);
  if (copied) window.copied = value;
  return copied;
};
const original = window.fetch.bind(window);
window.fetch = (url, options) => {
  if (String(url).includes('/api/remediation/approve')) {
    window.approvals.push({method: options.method, body: String(options.body)});
    return Promise.resolve(new Response(JSON.stringify(window.failApproval ? {error:'审批服务暂不可用'} : {success:true}),
      {status: window.failApproval ? 503 : 200, headers: {'content-type':'application/json'}}));
  }
  if (!/\/api\/(ask|query)\?/.test(String(url))) return original(url, options);
  window.requests.push({url:String(url),method:options.method});
  const stream = new ReadableStream({start(controller) {
    window.emit = (event,data) => controller.enqueue(new TextEncoder().encode(
      'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));
    window.finish = () => controller.close();
  }});
  return Promise.resolve(new Response(stream, {headers:{'content-type':'text/event-stream'}}));
};
'''

REPORT = '''## 根因与证据

`payments/api-7f9b` 的上一次退出状态为 **OOMKilled**。采集到的资源配置中，内存上限为 `64Mi`。

| 证据 | 观察结果 | 来源 |
| --- | --- | --- |
| Pod 状态 | OOMKilled · 重启 6 次 | Kubernetes |
| 内存限制 | 64Mi | Pod 配置 |
| 日志 | 退出前出现内存分配失败 | 容器日志 |

### 建议与验证

结合业务负载核实内存需求，再审阅资源调整方案。当前尚未执行变更。

```yaml
resources:
  limits:
    memory: 64Mi
```
'''
RAW = 'Name: api-7f9b\n    Namespace: payments\n\n    Last State: OOMKilled\n    Limit: 64Mi\n' + 'long-log-line-' * 45

with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    errors = []
    def page_for(width=1440, theme='light', reduced_motion='no-preference'):
        page = browser.new_page(viewport={'width': width, 'height': 1000 if width > 640 else 844},
                                color_scheme=theme, reduced_motion=reduced_motion)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script(MOCK)
        page.goto(args.url)
        page.get_by_role('heading', name='运维工作台').wait_for()
        return page

    def emit(page, event, data):
        page.evaluate('([event,data]) => window.emit(event,data)', [event, data])

    def fit(page):
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Page overflows viewport'
        assert page.get_by_role('button', name='停止', exact=True).is_visible() or page.get_by_role('button', name='发送', exact=True).is_visible()
        box = page.locator('textarea').bounding_box()
        assert box['x'] >= 0 and box['x'] + box['width'] <= page.viewport_size['width'] + 1
        assert box['y'] + box['height'] <= page.viewport_size['height']
        assert page.get_by_role('heading', name='运维工作台').bounding_box()['x'] >= 0

    # Empty-state layout in both themes and small/large viewports.
    for width in (320, 390, 768, 1440):
        for mode in ('light', 'dark'):
            page = page_for(width, mode)
            expect(page.locator('html')).to_have_attribute('data-theme', mode)
            fit(page)
            assert page.evaluate('window.requests.length') == 0
            if width in (390, 1440):
                page.screenshot(animations='disabled', path=str(out / f'home-{mode}-{width}.png'))
            if width == 390:
                page.get_by_role('button', name='展开侧栏', exact=True).click()
                dialog = page.get_by_role('dialog')
                expect(dialog).to_be_visible()
                dialog.get_by_role('button', name='使用说明').click()
                expect(dialog.get_by_text('适用范围', exact=True)).to_be_visible()
                page.keyboard.press('Escape')
                expect(dialog).not_to_be_visible()
                expect(page.get_by_role('button', name='展开侧栏', exact=True)).to_be_focused()
            page.close()

    # Shortcuts only populate an editable draft; all questions are submitted by the composer.
    for label, mode, question in (
        ('简单查询', 'query', '查询我各个节点的cpu和内存使用率'),
        ('深度诊断', 'ask', '我的集群有什么问题？'),
    ):
        page = page_for()
        expect(page.get_by_role('group', name='对话模式')).to_have_count(0)
        shortcut = page.get_by_role('button', name=label, exact=False)
        shortcut.click()
        draft = page.get_by_role('textbox', name='运维问题')
        expect(draft).to_have_value(question)
        expect(draft).to_be_focused()
        assert page.evaluate('window.requests.length') == 0
        draft.press('Shift+Enter')
        assert page.evaluate('window.requests.length') == 0
        draft.fill('临时编辑')
        shortcut.click()
        expect(draft).to_have_value(question)
        draft.fill(question + ' 请只查看当前数据。')
        if mode == 'query':
            draft.press('Enter')
        else:
            page.get_by_role('button', name='发送', exact=True).click()
        page.wait_for_function('window.requests.length === 1')
        request = page.evaluate('window.requests[0]')
        assert urlparse(request['url']).path == '/api/ask'
        assert parse_qs(urlparse(request['url']).query)['q'] == [question + ' 请只查看当前数据。']
        emit(page, 'final', {'answer':'已收到问题'})
        page.evaluate('window.finish()')
        page.close()

    page = page_for(reduced_motion='reduce')
    page.get_by_role('button', name='切换深色主题').click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    page.reload()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    page.get_by_role('button', name='切换浅色主题').click()
    expect(page.get_by_role('button', name='发送', exact=True)).to_be_disabled()
    textarea = page.get_by_role('textbox', name='运维问题')
    textarea.fill('诊断 payments/api-7f9b')
    textarea.dispatch_event('keydown', {'key': 'Enter', 'code': 'Enter', 'isComposing': True})
    assert page.evaluate('window.requests.length') == 0, 'IME submitted a partial composition'
    textarea.press('Shift+Enter')
    assert '\n' in textarea.input_value()
    textarea.fill('诊断 payments/api-7f9b\n分析重启原因')
    textarea.press('Enter')
    page.wait_for_function('window.requests.length === 1')
    request = page.evaluate('window.requests[0]')
    query = parse_qs(urlparse(request['url']).query)
    assert request['method'] == 'GET' and urlparse(request['url']).path == '/api/ask'
    assert query['q'] == ['诊断 payments/api-7f9b\n分析重启原因']
    assert query['format'] == ['sse'] and query['stream'] == ['true'] and query['remediate'] == ['true']
    session_id = query['session_id'][0]
    assert len(session_id) == 32
    emit(page, 'run_start', {'run_id': 'ui-fixture-run'})
    emit(page, 'node_start', {'node': 'request_router'})
    emit(page, 'node_complete', {'node': 'request_router', 'state_snapshot': {
        'request_route': 'full_diagnosis', 'request_contract': {'scope':'pod', 'namespaces':['payments'],
        'pod_names':['api-7f9b'], 'scope_basis':'用户明确指定目标 Pod', 'requested_outputs':['重启根因与处理建议']}}})
    emit(page, 'node_start', {'node':'evidence'})
    emit(page, 'thinking', {'node':'evidence','thinking_type':'ai_token','content':'正在核对 Pod 退出状态、资源限制和容器日志。'})
    emit(page, 'thinking', {'node':'evidence','thinking_type':'tool_start','tool_name':'kubectl_describe','tool_call_id':'tool-a'})
    spinner = page.locator('[class*="spinner"]').first
    expect(spinner).to_be_visible()
    assert spinner.evaluate('(el) => getComputedStyle(el).animationName') == 'none'
    tool_event = {'node':'evidence','thinking_type':'tool_result','tool_name':'kubectl_describe',
        'tool_call_id':'tool-a','status':'success','result_preview':'OOMKilled / Limit 64Mi','result':RAW}
    emit(page, 'thinking', tool_event)
    tool_detail = json.dumps(tool_event, ensure_ascii=False, indent=2)
    tool = page.get_by_role('button').filter(has_text='kubectl_describe').first
    tool.focus()
    tool.press('Enter')
    raw = page.locator('[class*="toolDetailBody"] pre code')
    assert raw.text_content() == tool_detail
    page.locator('[class*="toolDetailBody"]').get_by_role('button', name='复制内容').click()
    page.wait_for_function('(raw) => window.copied === raw', arg=tool_detail)
    expect(page.get_by_text('已复制', exact=True)).to_be_visible()
    page.evaluate('window.failCopy = true')
    page.locator('[class*="toolDetailBody"]').get_by_role('button', name='复制内容').click()
    expect(page.get_by_text('复制失败，请手动选择', exact=True)).to_be_visible()
    page.evaluate('window.failCopy = false')
    tool.press('Enter')
    emit(page, 'node_complete', {'node':'evidence','duration_seconds':4.2,'handoff_summary':'退出原因与内存上限已确认；需要结合业务负载验证资源需求。'})
    emit(page, 'final', {'answer':REPORT,'run_id':'ui-fixture-run'})
    expect(page.get_by_label('诊断结论', exact=True)).to_be_visible()
    page.get_by_role('button', name='查看结论', exact=True).click()
    page.get_by_role('button', name='复制报告', exact=True).click()
    page.wait_for_function('(report) => window.copied === report', arg=REPORT.strip())
    page.get_by_label('诊断结论').get_by_role('button', name='复制内容').click()
    page.wait_for_function("(value) => window.copied === value", arg="resources:\n  limits:\n    memory: 64Mi\n")
    # Original SSE stays open after final, and no approval is sent automatically.
    expect(page.get_by_role('button', name='停止', exact=True)).to_be_visible()
    assert page.evaluate('window.approvals.length') == 0
    payload = {'group_id':'g1','target':{'namespace':'payments','pod':'api-7f9b'},'risk_level':'中风险',
        'risk':'调整控制器资源配置将触发滚动更新，期间可能短暂不可用。',
        'dry_run_command':'kubectl set resources deployment/api -n payments --limits=memory=256Mi --dry-run=server -o yaml',
        'execute_command':'kubectl set resources deployment/api -n payments --limits=memory=256Mi',
        'verify_command':'kubectl rollout status deployment/api -n payments',
        'rollback_advice':'若验证失败，请依据变更前的资源配置恢复并检查工作负载状态。'}
    emit(page, 'remediation_approval_required', {'run_id':'ui-fixture-run','approval_id':'ui-review',
        'approval_kind':'action','title':'调整 payments/api 内存限制','description':'请审阅目标对象和命令，确认后再执行。',
        'payload':payload,'server_time':100,'expires_at':700})
    expect(page.get_by_role('button', name='同意', exact=True)).to_be_enabled()
    page.set_viewport_size({'width':1440, 'height':1200})
    for mode in ('light', 'dark'):
        if mode == 'dark':
            page.get_by_role('button', name='切换深色主题').click()
        page.get_by_label('对话内容', exact=True).evaluate('(el) => el.scrollTop = el.scrollHeight')
        page.screenshot(animations='disabled', path=str(out / f'approval-{mode}.png'))
        fit(page)
    page.set_viewport_size({'width':390, 'height':844})
    fit(page)
    page.screenshot(animations='disabled', path=str(out / 'approval-dark-390.png'))
    page.set_viewport_size({'width':1440, 'height':1000})
    page.evaluate('window.failApproval = true')
    page.get_by_role('button', name='同意', exact=True).click()
    expect(page.get_by_role('alert').filter(has_text='HTTP 503')).to_be_visible()
    expect(page.get_by_role('button', name='同意', exact=True)).to_be_enabled()
    assert len(page.evaluate('window.approvals')) == 1
    page.evaluate('window.failApproval = false')
    page.get_by_role('button', name='拒绝', exact=True).click()
    expect(page.get_by_text('已拒绝', exact=True)).to_be_visible()
    rejection = page.evaluate('window.approvals[1]')
    assert rejection['method'] == 'POST'
    assert parse_qs(rejection['body']) == {'run_id':['ui-fixture-run'], 'approval_id':['ui-review'],
        'approved':['false'], 'reviewer':['operator'], 'reason':['用户不认可修复方案']}
    emit(page, 'remediation_finished', {'run_id':'ui-fixture-run','status':'rejected','reason':'用户拒绝'})
    page.evaluate('window.finish()')
    expect(page.get_by_role('button', name='发送', exact=True)).to_be_visible()
    page.wait_for_function("JSON.parse(localStorage.getItem('aiops_chat_sessions')).length === 1")
    saved = page.evaluate("JSON.parse(localStorage.getItem('aiops_chat_sessions'))[0]")
    assert saved['id'] == session_id and saved['messages'][-1]['remediationApprovals'][0]['payload'] == payload
    assert set(saved) == {'id','title','messages','nodeBlocks','finalAnswer','endpointMode','createdAt','updatedAt'}
    # Follow-up questions retain the session and use backend routing.
    textarea.fill('再查一下当前内存使用情况')
    textarea.press('Enter')
    page.wait_for_function('window.requests.length === 2')
    followup = parse_qs(urlparse(page.evaluate('window.requests[1].url')).query)
    assert followup['session_id'] == [session_id] and followup['remediate'] == ['true']
    assert '/api/ask?' in page.evaluate('window.requests[1].url')
    page.get_by_role('button', name='停止', exact=True).click()
    expect(page.get_by_role('button', name='发送', exact=True)).to_be_visible()
    # Persisted session, search, cancel/confirm deletion, and accessible selection.
    page.reload()
    search = page.get_by_role('textbox', name='搜索历史会话')
    search.fill('no-match')
    expect(page.get_by_text('没有匹配的会话', exact=True)).to_be_visible()
    search.fill('payments')
    session = page.get_by_role('navigation', name='历史会话').get_by_role('button').first
    session.focus()
    session.press('Enter')
    expect(page.get_by_label('诊断结论', exact=True).first).to_be_visible()
    for width in (390, 768, 1440):
        page.set_viewport_size({'width':width,'height':1000})
        if width == 390:
            drawer = page.get_by_role('dialog')
            if drawer.is_visible():
                page.keyboard.press('Escape')
                expect(drawer).not_to_be_visible()
        fit(page)
        page.get_by_label('对话内容', exact=True).evaluate('(el) => el.scrollTop = 0')
        page.screenshot(animations='disabled', path=str(out / f'diagnosis-dark-{width}.png'))
    if page.get_by_role('button', name='展开侧栏', exact=True).is_visible():
        page.get_by_role('button', name='展开侧栏', exact=True).click()
    page.get_by_role('button', name='删除会话：', exact=False).click()
    page.get_by_role('button', name='取消', exact=True).click()
    assert len(page.evaluate("JSON.parse(localStorage.getItem('aiops_chat_sessions'))")) == 1
    page.get_by_role('button', name='删除会话：', exact=False).click()
    page.get_by_role('button', name='删除', exact=True).click()
    page.wait_for_function("JSON.parse(localStorage.getItem('aiops_chat_sessions')).length === 0")
    expect(page.get_by_text('暂无历史会话', exact=True)).to_be_visible()
    page.close()
    assert not errors, errors
    browser.close()
    print('PASS: 8 theme/viewport combinations; mobile drawer/Escape/focus; theme persistence; IME/keyboard; raw/code/report copy and failure; reduced motion; unchanged request/session schema; post-final approval, HTTP failure and rejection; history search/delete/cancel; responsive diagnosis screenshots')
