# Plugin runtime scripts

`prelude.js`, `url.js` and `axios.js` are the sandbox scripts of
[TimbreBox](https://github.com/weikxs/timbrebox) (`apps/timbrebox_app/assets/plugin_runtime/`), copied unchanged
so plugins run in tests exactly as they run in the app. Only the host side differs: `tools/sandbox.mjs` answers
the requests with the responses a test gives instead of the network.

Copied from TimbreBox commit `39b586f`. When TimbreBox changes them, copy them again and update this commit.
