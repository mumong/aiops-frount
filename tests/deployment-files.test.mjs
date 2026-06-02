import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('frontend image build files exist', () => {
  assert.equal(existsSync(new URL('../VERSION', import.meta.url)), true)
  assert.equal(existsSync(new URL('../Dockerfile', import.meta.url)), true)
  assert.equal(existsSync(new URL('../.dockerignore', import.meta.url)), true)
  assert.equal(existsSync(new URL('../nginx.conf', import.meta.url)), true)
  assert.equal(existsSync(new URL('../Makefile', import.meta.url)), true)
})

test('Dockerfile builds Vite app and serves dist with nginx', () => {
  const dockerfile = read('Dockerfile')

  assert.match(dockerfile, /FROM node:\d+-alpine AS build/)
  assert.match(dockerfile, /npm ci/)
  assert.match(dockerfile, /npm run build/)
  assert.match(dockerfile, /FROM nginx:alpine/)
  assert.match(dockerfile, /COPY --from=build .*dist.*\/usr\/share\/nginx\/html/)
})

test('nginx serves SPA and proxies API to the in-cluster backend service', () => {
  const nginx = read('nginx.conf')

  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/)
  assert.match(nginx, /location \/api\//)
  assert.match(nginx, /proxy_pass http:\/\/aiops-copilot\.aiops\.svc\.cluster\.local:8000\//)
  assert.match(nginx, /proxy_buffering off/)
})

test('Kubernetes manifest deploys a temporary NodePort frontend pod', () => {
  const manifest = read('deploy/k8s-simple.yaml')

  assert.match(manifest, /kind: Deployment/)
  assert.match(manifest, /name: aiops-copilot-frontend/)
  assert.match(manifest, /image: xnet\.registry\.io:8443\/xnet-cloud\/aiops-copilot-frontend:/)
  assert.match(manifest, /kind: Service/)
  assert.match(manifest, /type: NodePort/)
  assert.match(manifest, /nodePort: 30081/)
})

test('Makefile supports build push deploy delete restart logs and version sync', () => {
  const makefile = read('Makefile')

  for (const target of ['build:', 'push:', 'deploy:', 'delete:', 'restart:', 'logs:', 'sync-version:']) {
    assert.match(makefile, new RegExp(`^${target}`, 'm'))
  }
  assert.match(makefile, /IMAGE_NAME := aiops-copilot-frontend/)
  assert.match(makefile, /NAMESPACE := aiops/)
  assert.match(makefile, /DEPLOYMENT := aiops-copilot-frontend/)
  assert.match(makefile, /kubectl rollout status deployment\/\$\(DEPLOYMENT\) -n \$\(NAMESPACE\)/)
})
