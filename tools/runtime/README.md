# Plugin runtime scripts

These are the sandbox scripts of [TimbreBox](https://github.com/weikxs/timbrebox)
(`apps/timbrebox_app/assets/plugin_runtime/`), copied unchanged so plugins run in tests exactly as they run in
the app. Only the host side differs: `tools/sandbox.mjs` answers requests with the responses a test gives
instead of the network, and media RPC uses explicit fixtures only — no native process is started.

## Reviewed snapshot

`host-snapshot.json` pins the TimbreBox commit and the SHA-256 of every mirrored file. `tools/check.mjs`
verifies the digests offline through `tools/runtime_snapshot.mjs`, so an accidental or partial edit fails a
check instead of silently drifting from the tested host.

| Mirror | Upstream asset |
| --- | --- |
| `prelude.js`, `url.js`, `axios.js` | same names |
| `guest_search_capture.js` | same name |
| `guest_search_diagnostic.js` | same name |
| `../extractors/guest-search-parser.cjs` | `guest_search_parser.js` |

To follow a host change, update the files from a reviewed TimbreBox commit **and** update the commit and
digests in the same change; never reseal a digest without reading the new script. `extractors/README.md`
explains what the shared parser does.

## Host capabilities these scripts assume

The mirror alone does not make a plugin work. The host must provide:

- the `__hostHttp` bridge and a promise pump (HTTP is the sandbox's only network path);
- `__hostMedia` with the fixed `search`/`resolve` operations and the shared `env.media.source` adapter used by
  the experimental platform plugins;
- a per-run script time limit and cancellation that actually closes sockets.

A host without the media bridge is rejected by the experimental plugins with `extractor_unavailable` rather
than being reported as an empty result.
