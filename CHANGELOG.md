# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each plugin has its own version
(its `version` field), following [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The repository: README in English and Chinese with the disclaimer, the PolyForm Noncommercial license, the
  contribution guide, the security policy and the plugin standards.
- `make check`: a checker for the plugins, `index.json` and personal data, and tests that run each plugin on the same
  sandbox scripts the app uses, with the responses a test gives instead of the network. CI runs it on every pull
  request.
