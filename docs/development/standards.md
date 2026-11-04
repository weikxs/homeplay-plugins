# Plugin standards

The rules every plugin in this repository follows. They keep plugins small, readable and safe for the people
who type their passwords into them. [CONTRIBUTING.md](../../CONTRIBUTING.md) covers the workflow.

## 1. Scope

- A plugin may target video/streaming platforms, self-hosted libraries, WebDAV, open APIs, or other sources.
  Do not exclude sources solely by platform name, lack of a public API, or user-configuration needs.
- Document the actual access path, required permissions/configuration, rights and distribution considerations,
  tested capabilities, and known limitations. Scope inclusion does not authorize DRM circumvention or
  unauthorized paid access; preserve sandbox, egress, credential, and license protections.
- Publish only implemented and verified capabilities. YouTube, Bilibili, Douyin, and TikTok are planned plugin
  targets, not currently available plugins.

## 2. Format

Plugins use the plugin format of [TimbreBox](https://github.com/weikxs/timbrebox); its
[plugin guide](https://github.com/weikxs/timbrebox/blob/main/docs/plugin-development.md) is the reference for the
functions, data shapes and sandbox.

- **One file per plugin**, `plugins/<name>/<name>.js`, CommonJS (`module.exports = { … }`), plain ES2020. No
  build step, no bundler, no minified code: what is in the repository is what the user installs.
- Required metadata: `platform` (the name shown in the app), `version` (Semantic Versioning), `author`
  (`HomePlay Plugins`), and `srcUrl` (the raw URL of the file on `main`, so updates work).
- Functions are `async` and return the shapes the plugin guide describes. A plugin exports only the functions it
  really supports.
- Only the modules the sandbox provides may be `require`d (`axios`, `crypto-js`, `he`, `dayjs`, `qs`, `cheerio`,
  `big-integer`).

### Experimental files

Work that is not yet good enough for the subscription lives in `experimental/platforms/<name>.js` and follows
stricter machine-checked rules:

- `experimental: true`, a prerelease `version` (for example `0.1.1-dev`) and its own `srcUrl` under
  `experimental/platforms/`; the published checker rejects both directions of a mix-up.
- `requiredCapabilities` lists what the host must provide (`http`, `media.source`). Declaring a capability does
  not make the host have it: the adapter checks at call time and throws `extractor_unavailable` when the host
  lacks the bridge, instead of returning empty results.
- Document the remaining acceptance gaps in `experimental/platforms/README.md`. A file is published by moving it
  to `plugins/<name>/` and adding it to `index.json` once its platform evidence exists.

## 3. Settings and secrets

- Everything the user provides is declared in `userVariables` (`key`, `name`, `hint`) and read with
  `env.getUserVariables()` when it is needed, never cached in a global.
- Keys of secret values contain `password`, `token`, `secret` or `key`, so the app hides them while typed.
- A secret goes only to the server the user entered, in the way that server's API documents (for example a
  salted token instead of the password where the API offers one). It never appears in a URL that is shown to
  the user, in an error message or in `console.log` output.
- Missing or malformed settings produce a clear error that names the setting, not a request to a wrong host.

## 4. Network

- Document the service and CDN hosts a plugin uses. Requests must stay within its purpose and the host's
  egress policy. Send user credentials only to the intended, explicitly authorized service; do not copy them
  to a CDN or another host taken from a response or redirect.
- Keep requests few: one request per search page where the API allows it, and resolve stream URLs only when
  `getMediaSource` is called.
- Respect the API's documented limits, and set a `timeout` (at most 20 seconds) on every request.

## 5. Errors

- Throw an `Error` whose message says what went wrong in words the user understands ("The server rejected the
  user name or password"), never a raw response body.
- Return empty results (`{ isEnd: true, data: [] }`) for "nothing found"; throw only for real failures.

## 6. Tests

- Each plugin has tests next to it that run without a real server: requests are answered by recorded or
  hand-written demo responses.
- Tests cover search, `getMediaSource`, the settings checks and at least one error path.
- Demo data only: hosts such as `music.example`, the user `demo`, passwords generated in the test.

## 7. Versions and changes

- Bump the plugin's `version` with every change users can notice: patch for fixes, minor for new features,
  major when users must change their settings.
- Record each change in `CHANGELOG.md` under **Unreleased**, with the plugin name.
- Commit messages follow Conventional Commits with the plugin as the scope (`feat(subsonic): …`).

## 8. Privacy of the repository

No real server addresses, accounts, passwords, tokens, API keys, personal paths or names in code, tests, issues,
pull requests or commit messages.
