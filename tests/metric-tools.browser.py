"""Replay normalized native and Pod metric SSE events in the current UI."""
import argparse
import json
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--url', required=True)
p.add_argument('--chromium', required=True)
p.add_argument('--screenshot')
args = p.parse_args()
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1100, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script('''
      const original = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (!/\\/(query|ask)\\?/.test(String(url))) return original(url, options);
        const stream = new ReadableStream({start(c) {
          window.emit = (event,data) => c.enqueue(new TextEncoder().encode(
            'event: '+event+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));
          window.finish = () => c.close();
        }});
        return Promise.resolve(new Response(stream, {headers:{'content-type':'text/event-stream'}}));
      };
    ''')
    page.goto(args.url)
    page.locator('textarea').fill('验证两类指标工具展示')
    page.get_by_role('button', name='发送').click()
    page.wait_for_function('typeof window.emit === "function"')
    def emit(kind, value):
        page.evaluate('([k,v])=>window.emit(k,v)', [kind, value])
    emit('node_start', {'node':'query_collect'})
    samples = [
        ('execute_prometheus_instant_query', {'coverage':'present', 'parse_status':'parsed', 'series_count':1,
         'measurements':[{'name':'prometheus_sample','value':'22.6439','unit':'unknown','observed_at':'2026-10-08T09:11:23Z','labels':{}}]}, '22.6439'),
        ('execute_pod_promql', {'coverage':'present', 'measurements':[
         {'name':'memory','value':'1048576','unit':'bytes','labels':{'pod':'demo'},'observed_at':'2026-10-08T09:11:23Z'}]}, '1.00 MiB'),
        ('execute_prometheus_range_query', {'coverage':'present','result_type':'matrix','series_count':1,
         'measurements':[{'name':'sample','value':'8','unit':'unknown','sample_count':3,'point_policy':'latest_per_series'}]}, '不是整个区间的平均值'),
        ('empty_query', {'coverage':'empty','parse_status':'parsed','measurements':[]}, '无匹配数据'),
        ('unsupported_query', {'coverage':'unknown','parse_status':'unsupported','measurements':[]}, '暂未解析'),
        ('failed_query', {'coverage':'error','measurements':[]}, '查询未成功'),
        ('metric_state', {'coverage':'present', 'measurements':[
         {'name':'last_terminated_reason','value':'1','unit':'unitless',
          'labels':{'pod':'workload','container':'app','reason':'OOMKilled'}}]}, 'reason="OOMKilled"'),
        ('metric_targets', {'coverage':'present', 'measurements':[
         {'name':'up','value':'0','labels':{'pod':'p','instance':'a:80','endpoint':'http'}},
         {'name':'up','value':'1','labels':{'pod':'p','instance':'a:81','endpoint':'admin'}}]}, 'endpoint="admin"'),
        ('record_groups', {'contract_version':'evidence-records.v1', 'parse_status':'parsed',
         'semantic_success':True, 'execution_status':'success', 'record_unit':'pod',
         'result_type':'groups', 'query':{'group_by':'node'}, 'input_rows':4, 'matched_rows':4,
         'unknown_filter_rows':0, 'records':[{'node':'node1','count':4}], 'records_omitted':0,
         'source_metadata':{'coverage':'partial','scope':{'namespace':'xnet'},
                            'observed_at':'2026-10-09T10:00:00Z','next_continue_token':'next'}},
         '部分结果；不能代表完整范围'),
        ('record_byte_page', {'contract_version':'evidence-records.v1', 'parse_status':'parsed',
         'semantic_success':True,'execution_status':'success','record_unit':'pod','result_type':'records',
         'coverage':'partial','matched_rows':72,'input_rows':72,'unknown_filter_rows':0,'records':[],
         'pagination':{'snapshot_id':'test','offset':0,'returned_rows':12,'total_rows':72,'remaining_rows':60,
                       'next_continue_token':'lr1.test.12','source_has_more':False},
         'source_metadata':{'coverage':'present','observed_at':'2026-10-12T05:31:25Z'}},
         '仍有后续数据，可继续读取'),
        ('record_selection', {'contract_version':'evidence-records.v1', 'parse_status':'parsed',
         'semantic_success':True, 'execution_status':'success', 'record_unit':'container',
         'result_type':'records', 'input_rows':4, 'matched_rows':0, 'unknown_filter_rows':2,
         'records':[], 'records_omitted':0, 'source_metadata':{'coverage':'present',
         'scope':{'namespace':'xnet'},'observed_at':'2026-10-09T10:00:00Z'}},
         '条件未知的记录不能当作已确认不匹配'),
    ]
    for i, (name, display, _) in enumerate(samples):
        base = {'node':'query_collect', 'tool_name':name,'tool_call_id':f'call-{i}', 'tool_args':{'query':'example'}}
        emit('thinking', {**base,'thinking_type':'tool_start','id':f'start-{i}'})
        emit('thinking', {**base,'thinking_type':'tool_result','id':f'result-{i}', 'status':'success',
             'tool_display':{**display,'raw_ref':'/audit/raw','result_excerpt':'original result'}})
    emit('node_complete', {'node':'query_collect'})
    emit('final', {'run_id':'metric-display-browser','answer':'展示验证完成，未执行集群写操作。'})
    page.evaluate('window.finish()')
    for name, _, expected in samples:
        button = page.get_by_role('button', name=name, exact=False).first
        button.wait_for()
        if name in {'metric_state', 'metric_targets'}:
            assert expected in button.inner_text(), 'labels must be visible before expanding'
        button.click()
        assert expected in page.locator('body').inner_text(), expected
    text = page.locator('body').inner_text()
    assert '未返回可展示的数值事实' not in text
    assert '2026-10-08T09:11:23Z' in text
    assert not errors, errors
    if args.screenshot:
        page.screenshot(path=args.screenshot, full_page=True)
    page.reload()
    page.get_by_text('验证两类指标工具展示', exact=True).first.click()
    page.get_by_role('button', name='execute_prometheus_instant_query', exact=False).first.click()
    assert '22.6439' in page.locator('body').inner_text()
    page.get_by_role('button', name='record_groups', exact=False).first.click()
    assert 'node1: 4 Pod' in page.locator('body').inner_text()
    assert 'reason="OOMKilled"' in page.get_by_role('button', name='metric_state', exact=False).first.inner_text()
    assert 'endpoint="admin"' in page.get_by_role('button', name='metric_targets', exact=False).first.inner_text()
    page.get_by_role('button', name='收起侧栏', exact=True).click()
    for width in (1100, 390):
        page.set_viewport_size({'width': width, 'height': 1000})
        for name in ('metric_state', 'metric_targets'):
            button = page.get_by_role('button', name=name, exact=False).first
            button.scroll_into_view_if_needed()
            preview = button.locator('[class*="toolCallPreview"]')
            name_box = button.locator('[class*="toolCallName"]').bounding_box()
            preview_box = preview.bounding_box()
            assert name_box['width'] > 100, name_box
            assert preview_box['y'] >= name_box['y'] + name_box['height'], (name_box, preview_box)
            layout = preview.evaluate('''el => ({
                whiteSpace: getComputedStyle(el).whiteSpace,
                width: el.clientWidth, scrollWidth: el.scrollWidth,
                height: el.clientHeight, scrollHeight: el.scrollHeight,
            })''')
            assert layout['whiteSpace'] != 'nowrap', layout
            assert layout['width'] > 0 and layout['height'] > 0, layout
            assert layout['scrollWidth'] <= layout['width'] + 1, layout
            assert layout['scrollHeight'] <= layout['height'] + 1, layout
            if args.screenshot and name == 'metric_targets':
                button.screenshot(path=args.screenshot.replace('.png', f'-preview-{width}.png'))
    print('PASS: metrics and records, counts/units, partial/unknown, timestamps and history')
    browser.close()
