"""Opt-in read-only end-to-end diagnosis; never approves or starts repair jobs."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--chromium', required=True)
parser.add_argument('--live', action='store_true', required=True)
parser.add_argument('--question', required=True)
parser.add_argument('--expected-cases', type=int, default=4)
parser.add_argument('--rich-report', action='store_true')
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1280, 'height': 960})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('''
      window.testEvents = [];
      const original = window.fetch.bind(window);
      window.fetch = async (url, options) => {
        const response = await original(url, options);
        if (/\\/ask\\?/.test(String(url))) {
          const reader = response.clone().body.getReader();
          (async () => {
            const decoder = new TextDecoder(); let buffer = '';
            while (true) {
              const item = await reader.read(); if (item.done) break;
              buffer += decoder.decode(item.value, {stream: true});
              let end;
              while ((end = buffer.indexOf('\\n\\n')) >= 0) {
                const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
                const data = frame.split('\\n').find(l => l.startsWith('data:'));
                const type = frame.split('\\n').find(l => l.startsWith('event:'))?.slice(6).trim();
                if (data) { try {window.testEvents.push({...JSON.parse(data.slice(5)), type});} catch {} }
              }
            }
          })();
        }
        return response;
      };
    ''')
    events = []
    try:
        page.goto(args.url)
        page.locator('textarea').fill(args.question)
        page.get_by_role('button', name='发送', exact=True).click()
        page.wait_for_function("window.testEvents.some(e => ['final','error'].includes(e.type))", timeout=900000)
        events = page.evaluate('window.testEvents')
        failed = [e for e in events if e.get('type') == 'error']
        assert not failed, failed
        final = next(e for e in events if e.get('type') == 'final')
        cases = final.get('diagnosis_cases') or []
        assert len(cases) == args.expected_cases, [c.get('target') for c in cases]
        assert all(c.get('execution_status') == 'completed' for c in cases), cases
        assert not (final.get('diagnosis_overview') or {}).get('failed'), final
        assert not errors, errors
        if args.rich_report:
            for case in cases:
                for section in ['诊断结论', '异常现象', '关键证据', '原因分析', '待核实与采集边界']:
                    assert section in case.get('report', ''), (case['group_id'], section)
                assert '|' in case['report'], 'Expected real evidence table in RCA report'
        if cases:
            cards = page.get_by_label('分组诊断结果').locator('details')
            assert cards.count() == min(10, len(cases))
            if args.rich_report:
                assert page.get_by_label('分组诊断结果').locator('details:not([open])').count() == 0
                assert page.get_by_label('分组诊断结果').locator('table').count() >= min(10, len(cases))
            assert cards.first.get_attribute('open') is not None
            cards.first.locator('summary').click()
            assert cards.first.get_attribute('open') is None
            cards.first.locator('summary').click()
            assert cards.first.get_attribute('open') is not None
        page.screenshot(path=str(out / 'result.png'), full_page=True)
        (out / 'final.json').write_text(json.dumps(final, ensure_ascii=False, indent=2))
        # Owner-bound session is used only by the separate deferred planner test.
        context.storage_state(path=str(out / 'browser-state.json'))
        (out / 'browser-state.json').chmod(0o600)
        page.reload()
        if cases:
            # Reload intentionally opens a blank chat; select saved history.
            title = args.question[:40] + ('...' if len(args.question) > 40 else '')
            page.get_by_title(title, exact=True).click()
            page.get_by_label('分组诊断结果').wait_for(timeout=10000)
            assert page.get_by_label('分组诊断结果').locator('details').count() == min(10, len(cases))
        print(json.dumps({'run_id': final.get('run_id'), 'cases': len(cases),
            'frontend_errors': errors, 'reload_preserved': True}, ensure_ascii=False), flush=True)
    finally:
        (out / 'events.json').write_text(json.dumps(events or page.evaluate('window.testEvents || []'), ensure_ascii=False))
        browser.close()
