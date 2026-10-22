IMAGE_REPOSITORY := xnet.registry.io:8443
PROJECT := xnet-cloud
IMAGE_NAME := aiops-copilot-frontend
DOCKER_NAME := $(IMAGE_REPOSITORY)/$(PROJECT)/$(IMAGE_NAME)

VERSION ?= $(shell cat VERSION)
DOCKER_TAG := $(VERSION)
NAMESPACE := aiops
DEPLOYMENT := aiops-copilot-frontend

.PHONY: release build push deploy delete restart logs sync-version check test lint app-build help

# Recursive recipes preserve order even when invoked with make -j.
release:
	$(MAKE) build
	$(MAKE) push
	$(MAKE) deploy

check:
	$(MAKE) test
	$(MAKE) lint
	$(MAKE) app-build

test:
	npm test

lint:
	npm run lint

app-build:
	npm run build

help:
	@echo "check       Run tests, lint and application build in order (no deployment)"
	@echo "test/lint   Run the corresponding npm check"
	@echo "app-build   Compile TypeScript and build Vite assets"
	@echo "build/push  Build/push the Docker image (existing commands unchanged)"
	@echo "release     Build image, push, deploy in order"
	@echo "deploy      Apply existing image and wait for rollout; updates manifest tag"
	@echo "restart/logs/sync-version/delete  Existing Kubernetes operations"

build:
	@echo "Building $(DOCKER_NAME):$(DOCKER_TAG)..."
	docker build -t $(DOCKER_NAME):$(DOCKER_TAG) .

push:
	@echo "Pushing $(DOCKER_NAME):$(DOCKER_TAG)..."
	docker push $(DOCKER_NAME):$(DOCKER_TAG)

deploy:
	@echo "Deploying $(DOCKER_NAME):$(DOCKER_TAG)..."
	@sed -i 's|image: $(IMAGE_REPOSITORY)/$(PROJECT)/$(IMAGE_NAME):.*|image: $(DOCKER_NAME):$(DOCKER_TAG)|' deploy/k8s-simple.yaml
	@kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	kubectl apply -f deploy/k8s-simple.yaml
	@echo "Waiting for rollout to complete..."
	kubectl rollout status deployment/$(DEPLOYMENT) -n $(NAMESPACE) --timeout=300s

delete:
	@echo "Deleting frontend resources only..."
	kubectl delete -f deploy/k8s-simple.yaml --ignore-not-found

restart:
	@echo "Restarting frontend pods..."
	kubectl rollout restart deployment/$(DEPLOYMENT) -n $(NAMESPACE)
	kubectl rollout status deployment/$(DEPLOYMENT) -n $(NAMESPACE) --timeout=300s

logs:
	kubectl logs -f deployment/$(DEPLOYMENT) -n $(NAMESPACE)

sync-version:
	@echo "Syncing version to $(DOCKER_TAG)..."
	sed -i 's|image: $(IMAGE_REPOSITORY)/$(PROJECT)/$(IMAGE_NAME):.*|image: $(DOCKER_NAME):$(DOCKER_TAG)|' deploy/k8s-simple.yaml

# 多集群测试环境（robusta specs/008-multi-cluster）：中心的 30081 已被 xnet 前端占用，改用 30082。
MC_KUBE_DIR ?= $(HOME)/.kube/aiops-mc
# 有 $(MC_KUBE_DIR)/center 就用它，否则用当前 kubectl 上下文（直接在中心节点上执行时）
CENTER_KUBECONFIG ?= $(wildcard $(MC_KUBE_DIR)/center)
CENTER_KUBECTL = kubectl $(if $(CENTER_KUBECONFIG),--kubeconfig $(CENTER_KUBECONFIG))
# Agent 仓库目录（README 下载名 holmegpt-agent；开发机上是 robusta），只用于测试环境导入镜像
AGENT_DIR ?= $(firstword $(wildcard ../holmegpt-agent ../robusta))
MC_NODE_PORT ?= 30082
MC_LOAD_HOSTS ?=
.PHONY: deploy-mc
deploy-mc:
	@if test -n "$(MC_LOAD_HOSTS)"; then $(AGENT_DIR)/deploy-edge/load_image.sh $(DOCKER_NAME):$(DOCKER_TAG) $(MC_LOAD_HOSTS); fi
	$(CENTER_KUBECTL) create namespace aiops --dry-run=client -o yaml | $(CENTER_KUBECTL) apply -f -
	sed -e 's|image: $(DOCKER_NAME):.*|image: $(DOCKER_NAME):$(DOCKER_TAG)|' -e 's|nodePort: 30081|nodePort: $(MC_NODE_PORT)|' deploy/k8s-simple.yaml \
		| $(CENTER_KUBECTL) apply -f -
	$(CENTER_KUBECTL) -n aiops rollout restart deployment/aiops-copilot-frontend
	$(CENTER_KUBECTL) -n aiops rollout status deployment/aiops-copilot-frontend --timeout=300s
