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
  assert.deepEqual(presentRoute({request_route: 'focused'}).steps, ['query_collect'])
  assert.deepEqual(presentRoute({request_route: 'clarify'}).steps, [])
  assert.equal(presentRoute({request_route: 'stop'}).title, '任务识别未完成')
  assert.equal(presentRoute({}), undefined)
  assert.equal(presentRoute(null), undefined)
})

test('capability explanation does not imply missing user information', () => {
  assert.equal(presentRoute({request_route: 'focused', request_contract: {
    scope: 'unspecified', task: 'explain',
  }}).scope, '通用说明')
})

test('provider failure is distinct from clarification and retains safe error details', () => {
  const route = presentRoute({request_route: 'stop', request_error: {
    title: '模型服务请求失败', message: '模型服务返回 HTTP 500；本次已加载会话上下文。',
  }})
  assert.equal(route.title, '模型服务请求失败')
  assert.match(route.errorMessage, /HTTP 500/)
  assert.deepEqual(route.steps, [])
  assert.equal(presentRoute({request_route: 'clarify'}).errorMessage, undefined)
})

test('multi-cluster scope is shown before the resource scope', () => {
  const route = presentRoute({request_route: 'full_diagnosis', request_contract: {
    scope: 'namespace', namespaces: ['aiops-case-08'], clusters: ['vc-942nkkozc8o5fyb9q3bznb1ws'],
    cluster_labels: ['edge-88'], cluster_mode: 'single',
  }})
  assert.equal(route.scope, '集群 edge-88 · 命名空间 · aiops-case-08')
  assert.deepEqual(route.clusters, ['edge-88'])
})

test('several clusters, and canonical names when labels are missing', () => {
  const several = presentRoute({request_route: 'focused', request_contract: {
    scope: 'cluster', clusters: ['a', 'b'], cluster_labels: ['edge-88', 'edge-89'],
  }})
  assert.equal(several.scope, '集群 edge-88、edge-89 · 集群')
  const raw = presentRoute({request_route: 'focused', request_contract: {scope: 'cluster', clusters: ['vc-x']}})
  assert.deepEqual(raw.clusters, ['vc-x'])
})

test('single-cluster deployments show no cluster part', () => {
  const route = presentRoute({request_route: 'focused', request_contract: {scope: 'namespace', namespaces: ['xnet']}})
  assert.equal(route.scope, '命名空间 · xnet')
  assert.deepEqual(route.clusters, [])
})
