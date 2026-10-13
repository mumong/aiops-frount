"""Real browser, mocked transport: slow acknowledgement, duplicate clicks, timeout and expiry.

No real approval or cluster mutation is sent.
"""
import argparse
import json
import time
from playwright.sync_api import sync_playwright, expect

p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:5188')
p.add_argument('--chromium', required=True)
args = p.parse_args()
session = {'id': 'b'*32, 'title': '体验验证', 'createdAt': 1, 'updatedAt': 2,
           'endpointMode': 'ask', 'nodeBlocks': [], 'finalAnswer': '已诊断', 'messages': [
               {'id': 'm', 'role': 'assistant', 'content': '诊断完成', 'timestamp': 2,
                'status': 'complete', 'runId': 'fixture', 'repairRecord': {'run_id': 'fixture', 'kind': 'diagnosis'}}]}
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1100, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('localStorage.setItem("aiops_chat_sessions", ' + json.dumps(json.dumps([session])) + ')')
    page.add_init_script('''
      const original = window.fetch.bind(window);
      window.approvalCalls = 0; window.jobReads = 0; window.mode = 'slow';
      window.job = {job_id:'j1',group_id:'g1',version:1,status:'awaiting_approval',mode:'review',
        status_started_at:Date.now()/1000-5,
        plan:{targets:[],actions:[]},
        approval:{approval_id:'a1',expires_at:Date.now()/1000+120,decision_status:'pending'}};
      const reply = v => new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
      window.fetch = async (url, options={}) => {
        const path = String(url);
        if(path.includes('/remediation/approve')) {
          window.approvalCalls++;
          if(window.mode==='timeout') return new Promise((resolve,reject)=> {
            options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));
          });
          await new Promise(resolve=>setTimeout(resolve,2500));
          window.job.approval.decision_status='approved';
          return reply({success:true});
        }
        if(path.includes('/repair/batches')) return reply({batch_id:'batch-fixture',groups:[window.job]});
        if(path.includes('/repair/jobs/')) { window.jobReads++; return reply({...window.job,server_time:Date.now()/1000}); }
        return original(url,options);
      };
    ''')
    page.goto(args.url)
    page.get_by_role('navigation', name='历史会话').get_by_role('button', name='体验验证', exact=False).first.click()
    page.get_by_role('button', name='生成自动修复方案', exact=True).click()
    workspace = page.get_by_label('分组修复方案')
    button = workspace.get_by_role('button', name='批准此动作', exact=True)
    button.wait_for()
    button.evaluate('(button)=>{for(let i=0;i<20;i++)button.click()}')
    expect(workspace.get_by_text('正在提交批准，请勿重复点击…', exact=True)).to_be_visible(timeout=1000)
    expect(button).to_be_disabled()
    assert page.evaluate('window.approvalCalls') == 1
    expect(workspace.get_by_text('已批准，等待后端执行。', exact=True)).to_be_visible(timeout=6000)
    expect(button).to_be_disabled()
    # Another approval, transport timeout: keep GET reconciliation, never resend POST.
    page.evaluate("window.mode='timeout'; window.job.approval={approval_id:'a2',expires_at:Date.now()/1000+120,decision_status:'pending'}")
    expect(button).to_be_enabled(timeout=6000)
    button.click()
    expect(workspace.get_by_text('提交结果待确认，正在核对后端状态；不会重复提交。', exact=True)).to_be_visible(timeout=14000)
    reads = page.evaluate('window.jobReads')
    expect(button).to_be_disabled()
    page.wait_for_function('window.jobReads > ' + str(reads), timeout=6000)
    assert page.evaluate('window.approvalCalls') == 2
    page.evaluate("window.job.approval.decision_status='approved'")
    expect(workspace.get_by_text('已批准，等待后端执行。', exact=True)).to_be_visible(timeout=6000)
    # Expiry is independent of a pending poll response.
    page.evaluate("window.job.approval={approval_id:'a3',expires_at:Date.now()/1000+4,decision_status:'pending'}")
    expect(button).to_be_enabled(timeout=3500)
    expect(workspace.get_by_text('审批已到期', exact=False)).to_be_visible(timeout=6000)
    expect(button).to_be_disabled()
    page.evaluate("window.job.status='failed'; window.job.approval=null; window.job.plan={targets:[],actions:[],planning_error:{code:'model_connection_interrupted',message:'模型服务连接中断，方案未生成。尚未执行修复，可重新生成本组方案。'}}")
    expect(workspace.get_by_text('方案未生成 · 尚未执行', exact=True)).to_be_visible(timeout=6000)
    expect(workspace.get_by_role('button', name='重新生成本组方案', exact=True)).to_be_enabled()
    assert page.evaluate('window.approvalCalls') == 2
    page.screenshot(path='/tmp/repair-ux-verified.png', full_page=True)
    assert not errors, errors
    browser.close()
    print('PASS: immediate feedback, 20 clicks/one POST, timeout GET reconciliation, expiry, planning failure')
