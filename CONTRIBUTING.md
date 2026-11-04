# Contributing to HomePlay Plugins

Thanks for helping! This page is the short version; the full rules for plugin code are in
[docs/development/standards.md](docs/development/standards.md).

> HomePlay Plugins is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
> Please open an issue to discuss a new plugin before writing it.

## What belongs here

Source plugins may target video and streaming platforms (including YouTube, Bilibili, Douyin, and TikTok),
self-hosted services, WebDAV, open APIs, and other sources. A platform name, lack of a public API, or a need
for user configuration is not grounds for automatic rejection.

Describe the proposed access path, required configuration, rights and distribution considerations,
capabilities, tests, and known limitations in the issue. Review each implementation on its evidence;
roadmap inclusion does not authorize DRM circumvention or unauthorized paid access. Preserve sandbox,
egress, credential, and license protections. Do not advertise unimplemented or untested capabilities.

## Workflow

1. Open or pick an issue, and say you are working on it.
2. Create a branch from `main`: `feat/<plugin>`, `fix/<plugin>`, `docs/<topic>`, …
3. Write a failing test first, then the code that makes it pass.
4. Keep the change focused: one plugin, or one fix, per pull request. Update `CHANGELOG.md` under
   **Unreleased** for anything users notice.
5. Open a pull request using the template.

## Commit messages

[Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/), with the plugin as the scope:

```text
feat(subsonic): search and play from a Subsonic server
fix(webdav): keep spaces in folder names
```

Commits are authored by you only; do not add tool or bot attribution trailers.

## Test data

Use demo data only: hosts such as `music.example` or `example.org`, the user name `demo`, and passwords and
tokens generated inside the test. **Never put real server addresses, accounts, passwords, tokens, API keys or
personal paths in the repository, an issue or a pull request.**

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
