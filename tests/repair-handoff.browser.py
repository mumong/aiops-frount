"""Legacy saved-plan compatibility; new grouped entry has a separate replay."""
import argparse
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5188')
parser.add_argument('--chromium', required=True)
args = parser.parse_args()
session = {'id':'repair-browser-session-001','title':'修复交接验收','createdAt':1,'updatedAt':2,
    'endpointMode':'ask','nodeBlocks':[], 'finalAnswer':'已诊断', 'messages':[
        {'id':'msg-1','role':'user','content':'诊断 demo/app','timestamp':1},
        {'id':'msg-2','role':'assistant','content':'镜像引用错误，当前 Pod 未就绪。','timestamp':2,
         'status':'complete','runId':'diagnosis-fixture','repairRecord':{'run_id':'diagnosis-fixture','kind':'diagnosis'}}]}
plan = {'targets':[{'namespace':'demo','pod':'app-1','group_id':'g1'}],
        'actions':[{'id':'a1','group_id':'g1','description':'修正镜像','risk':'滚动更新',
            'execute_command':'kubectl set image deployment/app app=trusted:v1 -n demo',
            'configuration_change':'bad -> trusted:v1','verification_conditions':['新 Pod Ready'],
            'rollback_advice':'恢复旧配置需重新批准'}],
        'assessments':[{'group_id':'g1','status':'ready','reason':'有可信镜像基线','missing':[]}]}
session['messages'][-1].update(repairPlan=plan, runId='plan-fixture', repairRecord={
    'run_id': 'plan-fixture', 'kind': 'plan', 'source_run_id': 'diagnosis-fixture'})
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    for width in (1100, 390):
        page = browser.new_page(viewport={'width':width,'height':900})
        requests, errors = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def respond(route):
            query = parse_qs(urlparse(route.request.url).query)
            requests.append(query)
            rid = 'plan-revised'
            frames = [('run_start', {'run_id':rid}), ('final', {'run_id':rid,'answer':'修复方案已生成。',
                'repair_record':{'run_id':rid,'kind':'plan','source_run_id':'diagnosis-fixture'}, 'repair_plan':plan}),
                ('remediation_finished', {'run_id':rid,'status':'skipped','reason':'浏览器回放，不执行命令'})]
            route.fulfill(status=200, content_type='text/event-stream', body=''.join(
                f'event: {kind}\ndata: {json.dumps(data,ensure_ascii=False)}\n\n' for kind,data in frames))
        page.route('**/api/ask?*', respond)
        page.add_init_script('localStorage.setItem("aiops_chat_sessions", '+json.dumps(json.dumps([session]))+')')
        page.goto(args.url)
        if width <= 640:
            page.get_by_role('button', name='展开侧栏', exact=True).click()
        page.get_by_text('修复交接验收', exact=True).click()
        page.get_by_label('结构化修复方案').wait_for()
        assert 'kubectl set image' in page.get_by_label('结构化修复方案').inner_text()
        page.get_by_role('button',name='通过对话修改方案',exact=True).click()
        assert 'plan-fixture' in page.get_by_role('status').inner_text()
        page.get_by_label('运维问题').fill('请将镜像改为我批准的 trusted:v2')
        page.get_by_role('button',name='发送',exact=True).click()
        page.wait_for_function('document.body.textContent.includes("plan-revised")')
        assert requests[0]['plan_run_id'] == ['plan-fixture']
        assert 'diagnosis_run_id' not in requests[0]
        assert not errors, errors
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
        print(json.dumps({'width':width,'legacy_bound_revision':True,'errors':errors}))
        page.close()
    browser.close()
