# Subsonic

**English** | [简体中文](README.zh-CN.md)

Search and play the music on your own Subsonic-compatible server: Navidrome, Airsonic-Advanced, Gonic and others.

## Settings

| Setting | What to enter |
|---|---|
| Server address | The address you open the server at, such as `http://192.168.0.10:4533`, or `https://music.example/navidrome` when it runs under a path |
| User name | Your user name on the server |
| Password | Your password on the server |

For a server on your home network, enter its **IP address** (or its `.local` name), not a domain name: apps only let a
plugin into the home network for an address you typed yourself. In TimbreBox this needs a version with home-network
access for plugins.

**Tip:** create a separate account on the server for the player, without admin rights.

## What it does

- **Search**: songs by title, artist or album, 30 per page.
- **Play**: streams the original file.
- **Lyrics**: synced lyrics when the server offers them (the OpenSubsonic lyrics extension), otherwise plain lyrics.

## Privacy

Every request is signed the way the Subsonic API documents: your user name, a fresh random salt and
`md5(password + salt)`. Your password itself is never sent, logged or shown in an error. The stream address carries
that one-time signature; it goes only to your server. Cover art is not shown, since its address would carry the
signature into the app's library.

## Tested with

Navidrome 0.64.2 (search, play, synced and plain lyrics, wrong password, server off).
