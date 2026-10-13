"""Opt-in live read-only check. Does not create faults or approve repairs."""
import argparse
import json
from playwright.sync_api import sync_playwright, expect

p = argparse.ArgumentParser()
p.add_argument('--url', required=True)
p.add_argument('--chromium', required=True)
p.add_argument('--live', action='store_true', required=True)
p.add_argument('--question', default='请只读检查 aiops 命名空间当前 Pod 是否就绪，并说明查询依据；不扩大范围，不进行修复或资源变更。')
args = p.parse_args()
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1100, 'height':950})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script('''
      window.capturedEvents = [];
      const original = window.fetch.bind(window);
      window.fetch = async (url, options) => {
        const response = await original(url, options);
        if (/\\/ask\\?/.test(String(url))) {
          const reader = response.clone().body.getReader();
          (async () => {
            const decoder = new TextDecoder(); let buffer = '';
            while (true) {
              const item = await reader.read(); if (item.done) break;
              buffer += decoder.decode(item.value,{stream:true});
              let end;
              while ((end = buffer.indexOf('\\n\\n')) >= 0) {
                const frame = buffer.slice(0,end); buffer = buffer.slice(end+2);
                const data = frame.split('\\n').find(l=>l.startsWith('data:'));
                const event = frame.split('\\n').find(l=>l.startsWith('event:'))?.slice(6).trim();
                if (data) { try { window.capturedEvents.push({at:performance.now(), data:{...JSON.parse(data.slice(5)),type:event}}); } catch {} }
              }
            }
          })();
        }
        return response;
      };
    ''')
    page.goto(args.url)
    page.locator('textarea').fill(args.question)
    page.get_by_role('button', name='发送').click()
    page.wait_for_function("window.capturedEvents.some(e=>e.data.thinking_type==='ai_token' && e.data.content)", timeout=120000)
    expect(page.locator('[class*="nodeAnalysis"]').first).to_be_visible(timeout=5000)
    early = page.evaluate("({text:document.querySelector('[class*=nodeAnalysis]')?.innerText, final:window.capturedEvents.some(e=>e.data.type==='final')})")
    print('EARLY '+json.dumps(early, ensure_ascii=False), flush=True)
    page.screenshot(path='/tmp/live-visible-stream-early.png', full_page=True)
    page.wait_for_function("window.capturedEvents.some(e=>['final','error'].includes(e.data.type))", timeout=240000)
    events = page.evaluate('window.capturedEvents')
    kinds = [e['data'].get('type') for e in events]
    assert 'error' not in kinds, [e['data'] for e in events if e['data'].get('type')=='error']
    assert 'final' in kinds
    tokens = [e for e in events if e['data'].get('thinking_type')=='ai_token' and e['data'].get('content')]
    tools = [e for e in events if e['data'].get('thinking_type')=='tool_start']
    assert tokens and tools
    assert tokens[0]['at'] < tools[0]['at'], 'Model progress must precede first tool'
    assert not early['final'], 'Early display must be streamed, not a completed report'
    assert not errors, errors
    result = {'run_id':next(e['data'].get('run_id') for e in events if e['data'].get('run_id')),
              'tokens':len(tokens),'tool_calls':len(tools),'first_text_before_tool':True,'frontend_errors':errors,
              'nodes':[e['data'].get('node') for e in events if e['data'].get('type')=='node_start']}
    print('PASS '+json.dumps(result,ensure_ascii=False), flush=True)
    page.screenshot(path='/tmp/live-visible-stream-final.png', full_page=True)
    browser.close()
