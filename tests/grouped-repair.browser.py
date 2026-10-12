"""Grouped repair cards: scoped feedback, durable identity, no ordinary routing."""
import argparse
import json
import time
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5188')
parser.add_argument('--chromium', required=True)
args = parser.parse_args()
session = {'id': 'a'*32, 'title': '修复交接验收', 'createdAt': 1,
           'updatedAt': 2, 'endpointMode': 'ask', 'nodeBlocks': [], 'finalAnswer': '已诊断',
           'messages': [{'id': 'm1', 'role': 'user', 'content': '修复交接验收', 'timestamp': 1},
                        {'id': 'm2', 'role': 'assistant', 'content': '三个异常已完成诊断',
                         'timestamp': 2, 'status': 'complete', 'runId': 'diagnosis-fixture',
                         'repairRecord': {'run_id': 'diagnosis-fixture', 'kind': 'diagnosis'}}]}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    for width in (1100, 390):
        page = browser.new_page(viewport={'width': width, 'height': 1000})
        requests, errors = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        groups = [{'job_id': f'j{i}', 'group_id': f'g{i}', 'version': 1,
                   'status': 'awaiting_approval', 'mode': 'review'} for i in range(1, 4)]
        def respond(route):
            path = route.request.url.split('/api')[1]
            body = route.request.post_data_json if route.request.method == 'POST' else None
            requests.append((path, body))
            if path == '/repair/batches':
                assert body['diagnosis_run_id'] == 'diagnosis-fixture'
                value = {'batch_id': 'batch-diagnosis-fixture', 'groups': groups}
            elif '/repair/batches/' in path:
                value = {'batch_id': 'batch-diagnosis-fixture', 'groups': groups}
            elif path.endswith('/feedback'):
                assert path == '/repair/jobs/j2/feedback'
                assert body == {'version': 1, 'feedback': '只修改第二组'}
                groups[1] = {**groups[1], 'job_id': 'j2v2', 'version': 2,
                             'feedback': {'role':'user','text':body['feedback'],'source_version':1,'target_version':2}}
                value = groups[1]
            else:
                group = next((g for g in groups if g['job_id'] == path.split('/')[-1]),
                             {'job_id': 'j2', 'group_id': 'g2', 'version': 1, 'status': 'superseded'})
                gid = group['group_id']
                value = {**group, 'plan': {'targets': [{'namespace': 'demo', 'pod': gid, 'group_id': gid}],
                    'answer': f'{gid} 独立的异常原因', 'actions': [{'id': 'a1', 'group_id': gid,
                    'description': f'{gid} 修复动作', 'execute_command': f'kubectl get pod {gid} -n demo',
                    'risk': 'test', 'rollback_advice': 'test', 'verification_conditions': ['Ready']}]},
                    'approval': {'approval_id': f'approval-{gid}', 'title': f'{gid} 审批', 'expires_at': time.time()+600}}
                if group.get('version') == 2:
                    value['history'] = [{'job_id':'j2','version':1,'status':'superseded',
                                         'plan':{'targets':[],'actions':[], 'answer':'旧方案'}}]
            route.fulfill(status=200, content_type='application/json', body=json.dumps(value))
        page.route('**/api/repair/**', respond)
        page.route('**/api/ask?*', lambda route: (_ for _ in ()).throw(AssertionError('feedback routed to ask')))
        page.add_init_script('if (!localStorage.getItem("aiops_chat_sessions")) localStorage.setItem("aiops_chat_sessions", '
                             + json.dumps(json.dumps([session])) + ')')
        page.goto(args.url)
        if width <= 640:
            page.get_by_role('button', name='展开侧栏', exact=True).click()
        page.get_by_role('navigation', name='历史会话').get_by_role('button', name='修复交接验收', exact=False).first.click()
        page.get_by_role('button', name='生成自动修复方案', exact=True).click()
        workspace = page.get_by_label('分组修复方案')
        cards = workspace.get_by_role('group', name='选择修复组')
        expect(cards.get_by_role('button')).to_have_count(3)
        expect(workspace).to_contain_text('g1 独立的异常原因')
        notes = workspace.get_by_text('规划说明与任务详情', exact=True)
        expect(notes).to_be_visible()
        assert notes.locator('..').get_attribute('open') is None
        heading = workspace.get_by_role('heading', name='g1 · AI 修复方案 · v1')
        assert notes.bounding_box()['y'] < heading.bounding_box()['y']
        notes.click()
        expect(workspace.get_by_text('以下为规划时的记录，不代表命令已经执行。', exact=True)).to_be_visible()
        notes.click()
        action = workspace.get_by_role('article', name='修复动作 1')
        expect(action.get_by_text('demo/g1', exact=True)).to_be_visible()
        expect(action.get_by_text('g1 修复动作', exact=True).first).to_be_visible()
        expect(action.locator('pre')).to_have_text('kubectl get pod g1 -n demo')
        expect(action.get_by_text('风险：test', exact=True)).not_to_be_visible()
        action.get_by_text('风险、验证与回退 · 批准前请审阅', exact=True).click()
        expect(action.get_by_text('风险：test', exact=True)).to_be_visible()
        action.get_by_text('风险、验证与回退 · 批准前请审阅', exact=True).click()
        workspace.screenshot(path=f'/tmp/aiops-sprint2-repair-{width}.png')
        workspace.get_by_role('textbox').fill('第一组未提交草稿')
        cards.get_by_role('button', name='g2', exact=False).click()
        expect(workspace).to_contain_text('g2 独立的异常原因')
        expect(workspace).not_to_contain_text('g1 独立的异常原因')
        expect(workspace.get_by_role('textbox')).to_have_value('')
        workspace.get_by_role('textbox').fill('只修改第二组')
        cards.get_by_role('button', name='g1', exact=False).click()
        expect(workspace.get_by_role('textbox')).to_have_value('第一组未提交草稿')
        cards.get_by_role('button', name='g2', exact=False).click()
        expect(workspace.get_by_role('textbox')).to_have_value('只修改第二组')
        workspace.get_by_role('button', name='提交意见并重新生成').click()
        expect(workspace.get_by_role('heading', name='g2 · AI 修复方案 · v2')).to_be_visible()
        expect(workspace.get_by_label('你的修改意见')).to_contain_text('只修改第二组')
        expect(workspace.get_by_text('已提交，用于生成 v2 · 不代表批准执行', exact=True)).to_be_visible()
        expect(workspace.get_by_text('AI 历史方案 · v1（非当前执行版本）', exact=True)).not_to_be_visible()
        workspace.get_by_text('修改记录 · 1 个历史版本', exact=True).click()
        expect(workspace.get_by_text('AI 历史方案 · v1（非当前执行版本）', exact=True)).to_be_visible()
        workspace.screenshot(path=f'/tmp/aiops-feedback-history-{width}.png')
        assert groups[0]['job_id'] == 'j1' and groups[2]['job_id'] == 'j3'
        page.reload()
        if width <= 640:
            page.get_by_role('button', name='展开侧栏', exact=True).click()
        page.get_by_role('navigation', name='历史会话').get_by_role('button', name='修复交接验收', exact=False).first.click()
        expect(cards.get_by_role('button')).to_have_count(3)
        cards.get_by_role('button', name='g2', exact=False).click()
        expect(workspace.get_by_label('你的修改意见')).to_contain_text('只修改第二组')
        cards.get_by_role('button', name='g1', exact=False).click()
        expect(workspace.get_by_label('你的修改意见')).to_have_count(0)
        assert len([r for r in requests if r[0] == '/repair/batches']) == 1
        assert not errors, errors
        assert page.locator('body').evaluate('(e) => e.scrollWidth <= window.innerWidth')
        print(json.dumps({'width': width, 'group_cards': 3, 'scoped_revision': True, 'reload': True}))
        page.close()
    # A single blocked plan stays compact and submits the actual human evidence.
    page = browser.new_page(viewport={'width': 1100, 'height': 1000})
    group = {'job_id': 'single-v1', 'group_id': 'single', 'version': 1,
             'status': 'skipped', 'mode': 'review'}
    feedback = '确认这是测试资源，清理已完成，请重新核实并生成方案'
    submissions = []
    def single_response(route):
        global group
        path = route.request.url.split('/api')[1]
        if path.endswith('/feedback'):
            body = route.request.post_data_json
            assert body == {'version': 1, 'feedback': feedback}
            submissions.append(body)
            group = {**group, 'job_id': 'single-v2', 'version': 2,
                     'feedback': {'role':'user','text':body['feedback'],'source_version':1,'target_version':2}}
            value = group
        elif '/repair/batches' in path:
            value = {'batch_id': 'batch-diagnosis-fixture', 'groups': [group]}
        else:
            value = {**group, 'plan': {'actions': [], 'answer': '详细分析原文',
                'assessments': [{'group_id': 'single', 'reason': '清理状态未知',
                                 'missing': ['请确认清理已完成']}],
                'targets': [{'namespace': 'demo', 'pod': 'workload'}]},
                'result': {'reason': '没有可安全执行的结构化修复动作'}}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(value))
    page.route('**/api/repair/**', single_response)
    page.add_init_script('localStorage.setItem("aiops_chat_sessions", '
                         + json.dumps(json.dumps([session])) + ')')
    page.goto(args.url)
    page.get_by_role('navigation', name='历史会话').get_by_role('button', name='修复交接验收', exact=False).first.click()
    page.get_by_role('button', name='生成自动修复方案', exact=True).click()
    workspace = page.get_by_label('分组修复方案')
    expect(workspace.get_by_role('heading', name='AI 修复方案 · v1', exact=True)).to_be_visible()
    expect(workspace.get_by_role('group', name='选择修复组')).to_have_count(0)
    expect(workspace.get_by_text('请确认清理已完成', exact=True)).to_be_visible()
    expect(workspace.get_by_text('详细分析原文', exact=True)).not_to_be_visible()
    button = workspace.get_by_role('button', name='提交意见并重新生成')
    expect(button).to_be_disabled()
    workspace.get_by_role('textbox').fill(feedback)
    button.click()
    expect(workspace.get_by_role('heading', name='AI 修复方案 · v2', exact=True)).to_be_visible()
    expect(workspace.get_by_label('你的修改意见')).to_contain_text(feedback)
    assert len(submissions) == 1
    print(json.dumps({'single_compact': True, 'human_feedback_exact': True, 'revision': 2}))
    page.close()
    browser.close()
