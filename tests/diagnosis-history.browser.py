"""Replay saved structured cases; no model request or repair execution."""
import argparse
import copy
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--chromium', required=True)
parser.add_argument('--state', type=Path, required=True)
parser.add_argument('--synthetic-count', type=int)
args = parser.parse_args()
storage = json.loads(args.state.read_text())
entry = next(x for origin in storage['origins'] for x in origin['localStorage']
             if x['name'] == 'aiops_chat_sessions')
sessions = json.loads(entry['value'])
session = sessions[-1]
message = next(m for m in reversed(session['messages']) if m.get('diagnosisCases'))
if args.synthetic_count:
    template = message['diagnosisCases'][0]
    message['diagnosisCases'] = []
    for i in range(args.synthetic_count):
        case = copy.deepcopy(template)
        case['group_id'] = f'g{i}'
        case['summary'] = f'构造展示用例 {i}'
        case['report'] = f'独立报告 {i}'
        case['target']['entities'][0]['name'] = f'pod-{i}'
        message['diagnosisCases'].append(case)
    message['diagnosisOverview'] = {'text': '构造数据，非真实集群', 'total': args.synthetic_count,
                                   'completed': args.synthetic_count, 'partial': 0}
entry['value'] = json.dumps(sessions, ensure_ascii=False)
count = len(message['diagnosisCases'])
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    context = browser.new_context(storage_state=storage, viewport={'width': 1280, 'height': 960})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url)
    page.get_by_title(session['title'], exact=True).click()
    view = page.get_by_label('分组诊断结果')
    view.wait_for()
    assert view.locator('details').count() == min(count, 10)
    while view.locator('details').count() < count:
        view.get_by_role('button', name='显示更多', exact=False).click()
    cards = view.locator('details')
    assert cards.count() == count
    assert cards.last.get_attribute('open') is not None
    cards.last.locator('summary').click()
    assert cards.last.get_attribute('open') is None
    cards.last.locator('summary').click()
    assert cards.last.get_attribute('open') is not None
    assert not errors, errors
    print(json.dumps({'cases': count, 'history_restored': True, 'pagination': True,
                      'details_expand': True, 'errors': errors}), flush=True)
    browser.close()
