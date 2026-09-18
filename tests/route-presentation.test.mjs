import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/aiops-chat/routePresentation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { presentRoute } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('deep route shows actual Pod scope instead of implying cluster scan', () => {
  const route = presentRoute({request_route: 'full_diagnosis', request_contract: {
    scope: 'pod', namespaces: ['demo'], pod_names: ['workload'],
    scope_basis: '用户指定', requested_outputs: ['重启根因'],
  }})
  assert.equal(route.title, '深度诊断')
  assert.equal(route.scope, '指定 Pod · demo / workload')
  assert.deepEqual(route.steps, ['layer', 'evidence', 'rca', 'conclusion'])
  assert.deepEqual(route.outputs, ['重启根因'])
})

test('quick, clarify, stop and legacy histories have truthful routes', () => {
  assert.deepEqual(presentRoute({request_route: 'focused'}).steps, ['query_collect', 'conclusion'])
  assert.deepEqual(presentRoute({request_route: 'clarify'}).steps, [])
  assert.equal(presentRoute({request_route: 'stop'}).title, '任务识别未完成')
  assert.equal(presentRoute({}), undefined)
  assert.equal(presentRoute(null), undefined)
})
