# Common tasks. `make check` is what CI runs; run it before every pull request.
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check
check: lint test ## Everything CI runs: the repository checks and every test

.PHONY: lint
lint: ## Check the plugins, index.json and personal data (tools/check.mjs)
	node tools/check.mjs

.PHONY: test
test: ## Run the tests of the tools and every plugin
	node --test
