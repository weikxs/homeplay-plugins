# HomePlay Plugins

**English** | [简体中文](README.zh-CN.md)

Free **music-source plugins** for compatible players: video and streaming platforms, the music server on
your NAS, WebDAV folders, and open music catalogues. One subscription link for published plugins.

- **Free**: no account with us, no ads, no paid tier.
- **Source available**: every plugin is a single readable JavaScript file you can check before you install it.
- **Simple**: add the subscription link once; the app lists every plugin, and updates them when you ask.
- **Lightweight**: no build step, no dependencies to download; each plugin is a few kilobytes.
- **Private**: your server address, user name and password stay in the app on your device and go only to the
  server you entered. This repository never sees them.

> **Status: early.** The first plugin, Subsonic, is available; the others are planned. See
> [CHANGELOG.md](CHANGELOG.md).

## Plugins

| Plugin | What it plays | You provide | Status |
|---|---|---|---|
| [Subsonic](plugins/subsonic/README.md) | Navidrome, Airsonic and other Subsonic-compatible servers | Server address, user name, password | Available |
| Jellyfin | Music libraries on a Jellyfin server | Server address, user name, password | Planned |
| Emby | Music libraries on an Emby server | Server address, user name, password | Planned |
| WebDAV | Audio files in a WebDAV folder (NAS, cloud drives that offer WebDAV) | Folder address, user name, password | Planned |
| Plex | Music libraries on a Plex server | Server address, Plex token | Planned |
| Jamendo | Free, openly licensed music | Your own Jamendo client id | Planned |
| Podcast Index | Podcasts | Your own Podcast Index API key and secret | Planned |
| YouTube | Audio from platform content | To be determined during implementation | Planned, not available |
| Bilibili | Audio from platform content | To be determined during implementation | Planned, not available |
| Douyin | Audio from platform content | To be determined during implementation | Planned, not available |
| TikTok | Audio from platform content | To be determined during implementation | Planned, not available |

The scope includes platform sources, self-hosted libraries, and open APIs; sources are not excluded solely
by platform name or the absence of a public API. Each implementation must document its access requirements,
rights and distribution considerations, tested capabilities, and known limitations. Planned plugins are not
included in the subscription until published. Inclusion in the roadmap is not a claim of permission to
extract or download content.

## Supported apps

The plugins use the plugin format of [TimbreBox](https://github.com/weikxs/timbrebox), a free music player
for Windows, macOS, Linux, iOS and Android. Other apps that run plugins in that format can use them too.

## Install

1. Open the app's plugin settings.
2. Add the subscription link:

   ```text
   https://raw.githubusercontent.com/weikxs/homeplay-plugins/main/index.json
   ```

   or the link of a single plugin file.
3. Fill in the plugin's settings (the tune button next to it): your server address, user name and password.

**Home network addresses:** for a server on your home network, enter its IP address (for example
`http://192.168.0.10:4533`) or its `.local` name, not a domain name. The app lets a plugin reach only the home-network
addresses you typed into its settings; in TimbreBox this needs a version with home-network access for plugins.

## Disclaimer

Please read this before you use any plugin from this repository.

1. **For learning and personal use only.** The plugins are provided for study, research, testing and
   personal, noncommercial use. Any other use is not permitted (see [License](#license)).
2. **No content here.** This repository contains only plugin code. It does not host, store, mirror or
   distribute any music, video, lyric or other content, and it has no servers of its own.
3. **Your services, your responsibility.** A plugin connects to a service you choose, with an account you
   provide. You are responsible for having the right to access that service and its content, and for following
   its terms of use and the laws that apply to you.
4. **Delete what you may not keep.** If anything you obtain through a plugin is content you have no right to
   keep, delete it within 24 hours.
5. **No affiliation.** This project is not affiliated with, endorsed by or sponsored by any service a plugin
   connects to. Names and trademarks belong to their owners and are used only to say what a plugin works with.
6. **No warranty.** The plugins are provided "as is", without warranty of any kind. The authors are not
   liable for any loss, damage or claim arising from their use, including data loss, account restrictions or
   service changes.
7. **Takedown.** If you hold rights in something a plugin touches and believe a plugin should not be here,
   [open an issue](https://github.com/weikxs/homeplay-plugins/issues/new/choose). We review it promptly and
   remove the plugin when the request is valid.

Using a plugin from this repository means you have read and accepted this disclaimer.

## Contributing

New source plugins are welcome across platforms and service types; see
[CONTRIBUTING.md](CONTRIBUTING.md) and the [plugin standards](docs/development/standards.md). Report security
issues privately, see [SECURITY.md](SECURITY.md).

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). You may read, run, change and share the plugins for
noncommercial purposes. Commercial use requires a separate written license.
