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
  const version = read('VERSION').trim()

  assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.match(manifest, /kind: Deployment/)
  assert.match(manifest, /name: aiops-copilot-frontend/)
  // Image belongs to the named container, not beside the containers list.
  assert.match(manifest, /^ {8}- name: frontend\n {10}image: /m)
  assert.match(
    manifest,
    new RegExp(`image: xnet\\.registry\\.io:8443/xnet-cloud/aiops-copilot-frontend:${version.replaceAll('.', '\\.')}\\s`),
  )
  assert.match(manifest, /kind: Service/)
  assert.match(manifest, /type: NodePort/)
  assert.match(manifest, /nodePort: 30082/)
})

test('Makefile supports one-command release plus operations targets', () => {
  const makefile = read('Makefile')

  for (const target of ['release:', 'build:', 'push:', 'deploy:', 'delete:', 'restart:', 'logs:', 'sync-version:']) {
    assert.match(makefile, new RegExp(`^${target}`, 'm'))
  }
  assert.match(makefile, /\.PHONY: .*release/)
  assert.match(makefile, /release:\n\t\$\(MAKE\) build\n\t\$\(MAKE\) push\n\t\$\(MAKE\) deploy/)
  assert.match(makefile, /check:\n\t\$\(MAKE\) test\n\t\$\(MAKE\) lint\n\t\$\(MAKE\) app-build/)
  assert.match(makefile, /IMAGE_NAME := aiops-copilot-frontend/)
  assert.match(makefile, /IMAGE_REPOSITORY := xnet\.registry\.io:8443/)
  assert.match(makefile, /NAMESPACE := aiops/)
  assert.match(makefile, /DEPLOYMENT := aiops-copilot-frontend/)
  assert.match(makefile, /kubectl rollout status deployment\/\$\(DEPLOYMENT\) -n \$\(NAMESPACE\)/)
})

test('README documents local running and the copy-paste K8s deployment', () => {
  const readme = read('README.md')

  assert.match(readme, /### 本地运行/)
  assert.match(readme, /npm run dev/)
  assert.match(readme, /### K8s 环境部署/)
  assert.match(readme, /make deploy {2,}/)
  assert.match(readme, /失败自动回滚/)
  assert.match(readme, /make release/)
  assert.match(readme, /make deploy-mc/)
  assert.match(readme, /xnet\.registry\.io:8443\/xnet-cloud\/aiops-copilot-frontend:<VERSION>/)
  assert.match(readme, /http:\/\/<任意节点IP>:30082\//)
  // Details live in the guide, which the README links to.
  assert.match(readme, /\]\(docs\/GUIDE\.md\)/)
  assert.match(read('docs/GUIDE.md'), /GET \/ask/)
})
