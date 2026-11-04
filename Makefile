# Common tasks. `make check` is what CI runs; run it before every pull request.
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check
check: text-policy lint test ## Everything CI runs: text policy, repository checks and every test

.PHONY: text-policy
text-policy: ## Check current text, full history and policy regression tests
	python3 tools/check_repository_text.py --worktree --history
	python3 -m unittest discover -s tools -p 'test_repository_text.py'

.PHONY: hooks
hooks: ## Install local commit and push text guards
	git config core.hooksPath tools/hooks

.PHONY: lint
lint: ## Check the plugins, index.json and personal data (tools/check.mjs)
	node tools/check.mjs

.PHONY: test
test: ## Run the tests of the tools and every plugin
	node --test
