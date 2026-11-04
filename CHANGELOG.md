# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each plugin has its own version
(its `version` field), following [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The checker now also covers `experimental/platforms/`: an experimental file must be marked `experimental`,
  declare `requiredCapabilities`, use a prerelease version and its own `srcUrl`, and stays out of `index.json`.
- A missing host media bridge makes an experimental adapter fail with `extractor_unavailable` instead of an
  empty result; earlier host requirements were only described in prose.
- `tools/runtime/host-snapshot.json` pins the reviewed host commit and every mirrored script digest, verified
  offline, so a partial or accidental runtime edit fails a check.
- Development platform adapters in `experimental/platforms/`, using TimbreBox's fixed host media bridge for
  shared search/link/resolve logic. Not in the subscription: Douyin/TikTok keyword search and live playback
  are not complete. The offline test host now supports explicit media-RPC fixtures, never native processes.

- Experimental Douyin and TikTok page extractors with bounded link handling, cancellation, conservative
  paid/VIP/preview filtering, and offline tests. Not installable plugins; live search and playback are not
  verified, and no subscription entries are added. See `extractors/README.md`.

- Subsonic 1.0.0: search and play the music on a Subsonic-compatible server (Navidrome, Airsonic-Advanced, Gonic),
  with synced or plain lyrics. Requests are signed with a salted token; the password is never sent.
- The repository: README in English and Chinese with the disclaimer, the PolyForm Noncommercial license, the
  contribution guide, the security policy and the plugin standards.
- `make check`: a checker for the plugins, `index.json` and personal data, and tests that run each plugin on the same
  sandbox scripts the app uses, with the responses a test gives instead of the network. CI runs it on every pull
  request.
