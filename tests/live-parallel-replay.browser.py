"""Replay a captured real SSE run through the deployed UI, including history."""
import argparse,json
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
p.add_argument('--url',required=True)
p.add_argument('--events',required=True)
p.add_argument('--chromium',required=True)
p.add_argument('--screenshot',required=True)
a=p.parse_args()
with open(a.events) as f: events=[json.loads(line) for line in f]
assert any(e['event']=='final' for e in events),'Incomplete capture'
layer=next(e['data'] for e in events if e['event']=='node_complete' and e['data']['node']=='layer')
groups=layer['state_snapshot']['autonomous_groups']
assert len(groups)>=2
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=a.chromium,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1400,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''const original=window.fetch.bind(window);
    window.fetch=(url,options)=>{
      if(!/\\/(query|ask)\\?/.test(String(url)))return original(url,options);
      const body=new ReadableStream({start(c){window.emit=(event,data)=>c.enqueue(new TextEncoder().encode('event: '+event+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));window.finish=()=>c.close();}});
      return Promise.resolve(new Response(body,{headers:{'content-type':'text/event-stream'}}));
    };''')
    page.goto(a.url)
    title='真实三 Pod 并发运行回放'
    page.locator('textarea').fill(title)
    page.get_by_role('button',name='发送').click()
    page.wait_for_function('typeof window.emit === "function"')
    for event in events:
        # Token rendering has its own test; replay all lifecycle, complete text,
        # grouping, tool results, compaction status and terminal events here.
        if event['event']=='thinking' and event['data'].get('thinking_type')=='ai_token':continue
        page.evaluate('e=>window.emit(e.event,e.data)',event)
    page.evaluate('window.finish()')
    board=page.get_by_label('并发证据采集总览')
    board.wait_for()
    page.wait_for_timeout(500)
    assert f'{len(groups)} 个异常组' in board.inner_text()
    assert '本阶段已结束' in board.inner_text()
    assert '未归属结果' not in board.inner_text()
    for group in groups:
        card=board.locator('article').filter(has=page.locator('button[class*="groupButton"]').filter(has_text=group['entities'][0]['name']))
        assert card.count()==1
        card.get_by_role('button').first.click()
        assert card.locator('[class*="resultItem"]').count()>0
    assert '执行中' not in board.get_by_label('采集统计').inner_text()
    assert not errors,errors
    page.screenshot(path=a.screenshot,full_page=True)
    page.reload()
    page.get_by_text(title,exact=True).first.click()
    assert f'{len(groups)} 个异常组' in page.get_by_label('并发证据采集总览').inner_text()
    print('PASS real run replay: groups, exact targets, no unassigned results, truthful terminal calls, history')
    browser.close()
