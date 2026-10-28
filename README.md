# webos-snapclient

[Snapcast](https://github.com/snapcast/snapcast)'s `snapclient` packaged as an
app for LG **webOS TVs**, for the
[webOS Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).
This repo is the **packaging pipeline**, not the client: it takes the upstream
Debian **armel** build (the ABI webOS 5+ TVs actually run — see the webOS
section of snapcast's `doc/build.md`) and wraps it in a webOS `.ipk` with a
config UI and boot autostart. Layers and roadmap: [`VISION.md`](VISION.md).

## How it works

- **Daemon**: `bin/snapclient` (byte-identical to the upstream armel
  `--player pulse` build) + bundled `libsoxr` (webOS ships none) under the
  installed app dir `/media/developer/apps/usr/palm/applications/com.github.malkstar.snapclient/`.
- **Control**: the web app talks to the Homebrew Channel's public root
  `exec` API (`org.webosbrew.hbchannel.service/exec`) — no custom native
  code, no separate elevation step. Requires a **rooted TV with Homebrew
  Channel** (that's what `rootRequired: true` in the manifest means).
- **Config/autostart**: `/var/lib/webosbrew/com.github.malkstar.snapclient/config`;
  "start at boot" symlinks `bin/autostart.sh` into `/var/lib/webosbrew/init.d`
  (the webosbrew run-parts convention).
- **Sync notes**: the pulse player is the only sync-accurate option on webOS;
  the default `--latency 65` reflects measured webOS audio-pipeline delay
  (upstream docs). sdl2 is offered as fallback only ("more casting than
  sync-casting"); alsa is listed just to warn you away from it.

## Build

```sh
# payload: armel snapclient + libsoxr (extract upstream armel debs once they
# are published, or build per snapcast doc/build.md; see build.sh comments)
# RUNTIMELIBS (optional): dir with libssl.so.1.1 libcrypto.so.1.1
# libstdc++.so.6 libgcc_s.so.1 from Debian bullseye armel debs — CI fetches
# these sha256-pinned from archive.debian.org; set it for local builds too
# or the ipk will lack the runtime libs webOS 9 doesn't ship.
SNAPCLIENT_BIN=/path/to/snapclient LIBSOXR=/path/to/libsoxr.so.0.1.2 \
RUNTIMELIBS=/path/to/armel-runtimes ./build.sh
```

Produces `dist/com.github.malkstar.snapclient_<ver>_all.ipk` +
`dist/com.github.malkstar.snapclient.manifest.json`. The builder is
dependency-free (`tools/pack_ipk.py`, stdlib Python; ipk layout verified
against webosbrew's released packages — unsigned is correct for rooted TVs).

### CI builder (interim)

[`.github/workflows/build-armel.yml`](.github/workflows/build-armel.yml)
builds the armel payload from upstream sources on free GitHub-hosted runners
(bullseye container under qemu) and packs the ipk — dispatch it manually, or
push a `v*` tag to attach `dist/` assets to that release. It doubles as the
**proof recipe** for snapcast's upstream armel release PR: the commands in
`tools/armel-build-inside.sh` mirror that PR's `package.yml` job step-for-step
(the script header lists every intentional delta).
**Retirement clause:** once upstream ships armel debs, delete the `build-deb`
job and extract upstream artifacts in `build.sh` instead — this repo must not
become the de-facto home of armel builds.

## Publish & test on your TV

1. Create the repo `malkstar/webos-snapclient`, push; enable **GitHub Pages**
   from the `docs/` folder (branch-deploy only offers `/` or `/docs`; site
   content serves from the site root, so the apps.json URL is unchanged).
2. Draft release `<ver>` with tag `v<ver>` (the tag only materialises when the
   release is published — drafts alone never fire the build) — the tag trigger
   then runs `build-armel.yml`, which builds the payload and auto-attaches
   ipk + manifest + corresponding-source snapshot to the published release;
   assets are permanent, never delete old ones.
3. In Homebrew Channel: **Settings → Repositories → Add**:
   `https://malkstar.github.io/webos-snapclient/apps.json` (custom channel —
   usable for self-testing before central submission).
4. Or install the ipk directly:
   ```sh
   scp dist/*.ipk root@TV:/tmp/
   ssh root@TV 'luna-send -n 1 luna://com.webos.appInstallService/dev/install \
     "{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/<file>.ipk\",\"subscribe\":true}"'
   ```
5. Open **Snapclient** on the TV → server address → Save & Start.

CLI control without the UI (handy for scripting):

```sh
ssh root@TV 'luna-send -n 1 luna://org.webosbrew.hbchannel.service/exec \
  "{\"command\":\"sh /media/developer/apps/usr/palm/applications/com.github.malkstar.snapclient/bin/start-daemon.sh\"}"'
```

**Uninstall caveat**: stop the daemon + disable autostart in-app first (or
`pkill -x snapclient; rm -f /var/lib/webosbrew/init.d/com.github.malkstar.snapclient`),
then remove the app; state dir `/var/lib/webosbrew/com.github.malkstar.snapclient/`.

## Status / known TODOs

- Icons in `src/app/` are **generated placeholders** (80×80 / 130×130 PNG) —
  replace before submitting to the central catalog.
- `src/app/luna.js` is a minimal WebSocket Luna shim; if the TV webview is
  picky, vendor the official [webOSTVjs](https://github.com/webosose/webOSTVjs)
  (Apache-2.0) instead.
- Real-TV pass on the G5: install via route 2, UI round-trip (exec calls),
  autostart across reboot.
- Central submission checklist: [`docs/SUBMISSION.md`](docs/SUBMISSION.md),
  yml pre-staged in [`docs/apps-repo-package.yml`](docs/apps-repo-package.yml).

## Licenses & compliance

Snapcast is **GPL-3.0-or-later** (upstream `LICENSE` + per-file headers +
Debian `copyright` file); the bundled libsoxr is **LGPL-2.1-or-later**.
GPL-3.0 explicitly permits this repackaging/redistribution, conditioned on:

- **Source availability** — every release that ships the `.ipk` also ships
  the complete corresponding source: the snapcast snapshot tarball for the
  exact built revision (attached by CI), plus the build scripts this repo
  carries (`build-armel.yml`, `armel-build-inside.sh`, `build.sh`,
  `pack_ipk.py`) — GPL-3.0 §6.
- **Notices in the payload** — `build.sh` stages [`licenses/`](licenses/)
  (GPL/LGPL texts + the Debian machine-readable copyright files for both
  binaries) into the installed app.
- **No added restrictions** — the ipk carries no EULA; webOS-specific glue in
  this repo is the packaging recipe, which stays GPL-3.0 too.
- **LGPL shared-library form** — libsoxr ships as an unmodified `.so`,
  dynamically linked and replaceable.

Payload provenance and per-component grants: [`licenses/NOTICE.md`](licenses/NOTICE.md).
