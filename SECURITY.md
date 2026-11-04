# Security Policy

Plugins from this repository run inside music apps with the user's server addresses and passwords, so we treat
security reports as the highest priority.

## Supported versions

Only the latest version of each plugin on `main` receives security fixes.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through
[GitHub Security Advisories](https://github.com/weikxs/homeplay-plugins/security/advisories/new).

Please include:

- the plugin and its version, and the app and platform you used it in;
- steps to reproduce, with server addresses, accounts and private links replaced by placeholders;
- the impact you expect (for example, a plugin sending a password to a host the user did not enter).

## What to expect

| Step | Target |
|---|---|
| Acknowledge the report | within 3 days |
| Initial assessment | within 7 days |
| Fix for confirmed critical issues | as soon as possible, normally within 30 days |

We credit reporters in the changelog unless they prefer to stay anonymous.

## What a plugin may do

- Send requests only to the service and CDN hosts documented for the plugin's purpose, subject to the app's egress policy.
- Send the user's password or token only to its intended, explicitly authorized service; never forward it to a CDN or unrelated host through a response or redirect.
- Never log secrets or export settings to unrelated services. Keep user configuration in the app's protected local settings storage.

A plugin that breaks one of these rules is a security issue.
