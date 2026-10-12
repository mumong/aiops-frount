"""Read-only UI acceptance against real grouped-job API, using test-owner cookie."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--session', required=True, help='Private session.json from isolated live acceptance')
parser.add_argument('--chromium', required=True)
parser.add_argument('--screenshot', required=True)
args = parser.parse_args()
identity = json.loads(Path(args.session).read_text())
batch_id = identity['batch_id']
diagnosis = batch_id.removeprefix('batch-')
history = [{'id': 'c'*32, 'title': '真实分组修复验收', 'createdAt': 1, 'updatedAt': 1,
    'endpointMode': 'ask', 'nodeBlocks': [], 'finalAnswer': '隔离测试报告对应的真实后端修复记录。',
    'messages': [{'id': 'msg-1', 'role': 'user', 'content': '真实分组修复验收', 'timestamp': 1},
                 {'id': 'msg-2', 'role': 'assistant', 'content': '隔离测试报告对应的真实后端修复记录。',
                  'timestamp': 2, 'status': 'complete', 'runId': diagnosis, 'repairBatchId': batch_id,
                  'repairRecord': {'run_id': diagnosis, 'kind': 'diagnosis'}}]}]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100})
    context.add_cookies([{'name': 'aiops_query_owner', 'value': identity['cookie'], 'url': args.url}])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script('localStorage.setItem("aiops_chat_sessions", '+json.dumps(json.dumps(history))+')')
    page.goto(args.url)
    page.get_by_role('navigation', name='历史会话').get_by_role('button', name='真实分组修复验收', exact=False).first.click()
    workspace = page.get_by_label('分组修复方案')
    cards = workspace.get_by_role('group', name='选择修复组').get_by_role('button')
    expect(cards).to_have_count(3, timeout=15000)
    for index in range(3):
        cards.nth(index).click()
        expect(workspace.get_by_role('heading', name=f'g{index+1} · 方案', exact=False)).to_be_visible(timeout=15000)
        expect(workspace).to_contain_text('运行 ID')
    workspace.screenshot(path=args.screenshot)
    assert not errors, errors
    print('PASS: deployed UI reads three real group plans through owner-bound API; no mutation requested')
    browser.close()
