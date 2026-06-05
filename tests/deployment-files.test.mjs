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

test('Makefile supports one-command release plus operations targets', () => {
  const makefile = read('Makefile')

  for (const target of ['release:', 'build:', 'push:', 'deploy:', 'delete:', 'restart:', 'logs:', 'sync-version:']) {
    assert.match(makefile, new RegExp(`^${target}`, 'm'))
  }
  assert.match(makefile, /\.PHONY: .*release/)
  assert.match(makefile, /release: build push deploy/)
  assert.match(makefile, /IMAGE_NAME := aiops-copilot-frontend/)
  assert.match(makefile, /NAMESPACE := aiops/)
  assert.match(makefile, /DEPLOYMENT := aiops-copilot-frontend/)
  assert.match(makefile, /kubectl rollout status deployment\/\$\(DEPLOYMENT\) -n \$\(NAMESPACE\)/)
})

test('README documents local running, packaging, K8s one-command deployment, raw commands, and access URL', () => {
  const readme = read('README.md')

  assert.match(readme, /## 本地运行/)
  assert.match(readme, /npm run dev/)
  assert.match(readme, /## K8s 环境部署/)
  assert.match(readme, /### 快速部署已有镜像到 K8s/)
  assert.match(readme, /make deploy/)
  assert.match(readme, /### 访问前端/)
  assert.match(readme, /http:\/\/<任意K8s节点IP>:30081\//)
  assert.match(readme, /### 镜像还没构建时：一键打包、推送、部署/)
  assert.match(readme, /make release/)
  assert.match(readme, /### 手动打包前端镜像/)
  assert.match(readme, /docker build -t xnet\.registry\.io:8443\/xnet-cloud\/aiops-copilot-frontend:\$\(cat VERSION\) \./)
  assert.match(readme, /### 不使用 Makefile 的等价命令/)
  assert.match(readme, /kubectl apply -f deploy\/k8s-simple\.yaml/)
})
