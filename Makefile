IMAGE_REPOSITORY := xnet.registry.io:8443
PROJECT := xnet-cloud
IMAGE_NAME := aiops-copilot-frontend
DOCKER_NAME := $(IMAGE_REPOSITORY)/$(PROJECT)/$(IMAGE_NAME)

VERSION ?= $(shell cat VERSION)
DOCKER_TAG := $(VERSION)
NAMESPACE := aiops
DEPLOYMENT := aiops-copilot-frontend

.PHONY: build push deploy delete restart logs sync-version

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
