"""Replay overlapping session streams without contacting the backend."""
import argparse
import json
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--chromium', required=True)
args = parser.parse_args()

def session(identifier, title, answer):
    return {'id': identifier * 32, 'title': title, 'endpointMode': 'query', 'createdAt': 1, 'updatedAt': 1,
            'messages': [{'id':'msg-1','role':'user','content':title,'timestamp':1},
                         {'id':'msg-2','role':'assistant','content':answer,'status':'complete','timestamp':1}],
            'nodeBlocks': [], 'finalAnswer': answer}

with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1280,'height':1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    fixtures = [session('a','会话 A','A 原有报告'), session('b','会话 B','B 原有报告')]
    page.add_init_script('if (!localStorage.getItem("aiops_chat_sessions")) localStorage.setItem("aiops_chat_sessions", ' + json.dumps(json.dumps(fixtures)) + ')')
    page.add_init_script(r'''
      window.streams = [];
      window.approvals = [];
      const original = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (String(url).includes('/api/remediation/approve')) {
          window.approvals.push(String(options.body));
          return Promise.resolve(new Response('{"success":true}', {headers:{'content-type':'application/json'}}));
        }
        if (!/\/api\/(query|ask)\?/.test(String(url))) return original(url, options);
        const run = {url:String(url), aborted:false};
        const stream = new ReadableStream({start(controller) {
          run.emit = (event,data) => controller.enqueue(new TextEncoder().encode(
            'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));
          run.finish = () => controller.close();
        }});
        // Deliberately allow late chunks after abort, to test stale callbacks.
        options.signal.addEventListener('abort', () => {run.aborted=true});
        window.streams.push(run);
        return Promise.resolve(new Response(stream,{headers:{'content-type':'text/event-stream'}}));
      };
    ''')
    page.goto(args.url)
    def select(title):
        page.get_by_role('navigation',name='历史会话').get_by_role('button',name=title,exact=False).first.click()
    def emit(index,event,data):
        page.evaluate('([i,event,data])=>window.streams[i].emit(event,data)',[index,event,data])
    def finish(index):
        page.evaluate('(i)=>window.streams[i].finish()',index)
    def send(text,count):
        page.get_by_role('textbox',name='运维问题').fill(text)
        page.get_by_role('button',name='发送',exact=True).click()
        page.wait_for_function('(count)=>window.streams.length===count',arg=count)
    chat = page.locator('[aria-label="会话面板"]:visible').get_by_label('对话内容',exact=True)
    select('会话 A')
    send('A任务独有问题',1)
    emit(0,'run_start',{'run_id':'run-a'})
    emit(0,'node_start',{'node':'evidence'})
    emit(0,'thinking',{'node':'evidence','thinking_type':'ai_token','content':'A 初始分析'})
    select('会话 B')
    expect(chat).to_contain_text('B 原有报告')
    expect(chat).not_to_contain_text('A任务独有问题')
    assert page.evaluate('window.streams[0].aborted') is False
    emit(0,'thinking',{'node':'evidence','thinking_type':'ai_token','content':'，A 后台进展'})
    expect(chat).not_to_contain_text('A 后台进展')
    send('B任务独有问题',2)
    emit(1,'run_start',{'run_id':'run-b'})
    emit(1,'node_start',{'node':'query_collect'})
    emit(1,'thinking',{'node':'query_collect','thinking_type':'ai_token','content':'B 并发分析'})
    select('会话 A')
    expect(chat).to_contain_text('A 后台进展')
    expect(chat).not_to_contain_text('B 并发分析')
    assert not page.evaluate('window.streams.some(s=>s.aborted)')
    # Same-batch nodes/final and subsequent approval belong to A while B is viewed.
    select('会话 B')
    page.evaluate('''() => {
      const run=window.streams[0];
      run.emit('node_complete',{node:'evidence'});
      run.emit('final',{run_id:'run-a',answer:'A 最终报告'});
    }''')
    page.wait_for_timeout(150)
    assert page.evaluate('window.streams[0].aborted') is False
    emit(0,'remediation_approval_required',{'run_id':'run-a','approval_id':'approval-a','title':'A 修复审批','approval_kind':'action'})
    expect(chat).not_to_contain_text('A 最终报告')
    expect(chat.get_by_role('button',name='同意',exact=True)).to_have_count(0)
    select('会话 A')
    expect(chat).to_contain_text('A 最终报告')
    expect(chat).to_contain_text('A 后台进展')
    expect(page.get_by_role('button',name='同意',exact=True)).to_be_enabled()
    page.get_by_role('button',name='同意',exact=True).click()
    expect(page.get_by_text('已同意',exact=True)).to_be_visible()
    select('会话 B')
    select('会话 A')
    expect(page.get_by_text('已同意',exact=True)).to_be_visible()
    expect(chat.get_by_role('button',name='同意',exact=True)).to_have_count(0)
    assert page.evaluate('window.approvals.length') == 1
    assert 'run_id=run-a' in page.evaluate('window.approvals[0]')
    emit(1,'final',{'run_id':'run-b','answer':'B 后台完成报告'})
    finish(1)
    page.wait_for_function('JSON.parse(localStorage.getItem("aiops_chat_sessions")).some(s=>s.id==="b".repeat(32)&&s.finalAnswer==="B 后台完成报告")')
    expect(chat).to_contain_text('A 最终报告')
    expect(chat).not_to_contain_text('B 后台完成报告')
    emit(0,'remediation_finished',{'run_id':'run-a','status':'completed','reason':'A 修复结束'})
    finish(0)
    page.wait_for_function('JSON.parse(localStorage.getItem("aiops_chat_sessions")).some(s=>s.id==="a".repeat(32)&&s.finalAnswer==="A 最终报告")')
    saved=page.evaluate('JSON.parse(localStorage.getItem("aiops_chat_sessions"))')
    a=next(s for s in saved if s['id']=='a'*32)
    b=next(s for s in saved if s['id']=='b'*32)
    assert a['messages'][-1]['runId']=='run-a'
    assert a['messages'][-1]['nodeBlocks'][0]['thinkingTokens']=='A 初始分析，A 后台进展'
    assert a['messages'][-1]['remediationApprovals'][0]['approvalId']=='approval-a'
    assert b['messages'][-1]['runId']=='run-b'
    assert 'remediationApprovals' not in b['messages'][-1]
    select('会话 B')
    expect(chat).to_contain_text('B 后台完成报告')
    # Drafts are scoped to the session even when an idle panel unmounts.
    page.get_by_role('button',name='诊断',exact=True).click()
    page.get_by_role('textbox',name='运维问题').fill('B 未发送草稿')
    select('会话 A')
    expect(page.get_by_role('textbox',name='运维问题')).to_have_value('')
    select('会话 B')
    expect(page.get_by_role('textbox',name='运维问题')).to_have_value('B 未发送草稿')
    expect(page.get_by_role('button',name='诊断',exact=True)).to_have_attribute('aria-pressed','true')
    # New sessions do not cancel other live work; stopping is scoped to the visible session.
    send('B 再次运行',3)
    page.get_by_role('button',name='新建会话',exact=True).click()
    expect(page.get_by_role('heading',name='智能运维助手',exact=True)).to_be_visible()
    assert not page.evaluate('window.streams[2].aborted')
    send('C 新会话问题',4)
    page.get_by_role('button',name='停止',exact=True).click()
    assert page.evaluate('window.streams[3].aborted')
    assert not page.evaluate('window.streams[2].aborted')
    # Removing a running session disconnects only that session. Late events must not restore it.
    select('会话 B')
    page.get_by_role('button',name='删除会话：会话 B',exact=True).click()
    page.get_by_role('button',name='删除',exact=True).click()
    page.wait_for_function('window.streams[2].aborted')
    emit(2,'final',{'answer':'不应复活的 B 结果'})
    finish(2)
    emit(3,'final',{'answer':'不应覆盖的停止结果'})
    finish(3)
    page.wait_for_function('!JSON.parse(localStorage.getItem("aiops_chat_sessions")).some(s=>s.id==="b".repeat(32))')
    expect(chat).not_to_contain_text('不应复活')
    expect(chat).not_to_contain_text('不应覆盖')
    page.reload()
    select('会话 A')
    expect(chat).to_contain_text('A 最终报告')
    assert not errors, errors
    browser.close()
    print('PASS: live session switching, concurrent isolated runs, background completion without navigation, post-final approvals and UI state, scoped drafts, new session/stop/delete, stale callback rejection and history reload.')
