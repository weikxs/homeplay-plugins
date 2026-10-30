# Contributing to HomePlay Plugins

Thanks for helping! This page is the short version; the full rules for plugin code are in
[docs/development/standards.md](docs/development/standards.md).

> HomePlay Plugins is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).
> Please open an issue to discuss a new plugin before writing it.

## What belongs here

A plugin is welcome when it connects to:

- a service the user runs or rents for themselves (a music server, a WebDAV folder, a NAS), or
- a service that offers an open API to everyone, used with the user's own key where it asks for one.

A plugin is **not** accepted when it gets around a service's access rules: request signing it does not
publish, risk-control or anti-bot checks, paywalls, DRM, rate limits, or scraping pages that forbid it. Such
pull requests are closed without review.

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
