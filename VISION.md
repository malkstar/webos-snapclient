# Vision: Snapcast on webOS TVs — upstream support → IPK packaging pipeline

*Drafted 2026-10-26. End goal: any rooted LG/webOS TV user installs Snapclient
from the webOS Homebrew Channel like a regular app — and upstream Snapcast
supports that path at the artifact level, with a dedicated IPK packaging
pipeline repo handling the webOS-specific glue.*

## The two-repo principle

History (PR #1460 → SDL2 player renamed generic; docs-only webOS lane) shows
what upstream will and won't carry:

- **Upstream `snapcast/snapcast` carries the *generic* layers**: code, the
  armel ABI (Debian arch — the armel PR), and the webOS docs (#1562). Nothing
  webOS-brand-specific beyond what any embedded port needs.
- **A separate packaging repo carries the *webOS-specific* layers**: `.ipk`
  structure, the Homebrew Channel manifest, the Luna config UI, autostart
  glue. Channel-policy churn, JS/CSS, and TV breakage triage never touch
  upstream — exactly the "webOS-heavy" surface maintainers declined in #1460.

The armel PR is what keeps the packaging repo *thin*: upstream ships the
correct-ABI binary; the packaging repo is a reproducible shell around it.

## Pipeline

```
snapcast develop
   ├─ #1562 (docs): webOS ABI + build recipe          [SHIPPED]
   └─ armel PR: release matrix gains
        snapclient_<v>_armel_bullseye_with-pulse.deb  [DRAFTED: ci/armel-packages]
                     │
                     │  dpkg-deb -x → /usr/bin/snapclient
                     ▼
malkstar/webos-snapclient          (packaging repo — the IPK packaging pipeline; scaffolded at ~/dev/webos-snapclient)
   • build script: upstream armel deb + libsoxr0.deb's libsoxr.so.0
     (webOS ships no libsoxr; upstream debs link it dynamically)
   • webOS app: minimal config UI (server, player, latency, autostart)
     + daemon + autostart as root (webosbrew conventions)
   • GitHub Releases carry: org.<id>.snapclient_<v>.ipk + manifest.json
     (Homebrew Channel polls this manifestUrl)
                     │
                     ▼
webOS Homebrew Channel
   • Phase 1: custom channel URL → self-testing on the TV, no review
   • Phase 2: webosbrew/apps-repo PR = one packages/<id>.yml pointing at
     the manifestUrl ("repackages official upstream binaries" = clean
     open-source/pool=main story)
```

## Why this ordering helps each piece

- **armel PR upstream case strengthened** by the packaging repo: official
  armel debs have a downstream consumer feeding a device class (~all modern
  LG TVs), not just a hobby build.
- **apps-repo submission strengthened** by upstream: binaries come from
  snapcast's own release assets (if the armel PR merged). Fallback if it
  doesn't: packaging repo builds via the container recipe #1562 documented
  upstream — provenance story survives either way.
- **bullseye-only armel** (Debian retired armel after 11) is a feature, not a
  limit: glibc 2.31 baseline covers webOS 5+. The `_with-pulse` variant is
  precisely the webOS sync-accurate artifact (`--player pulse`; SDL2 is
  fallback-only — "more casting than sync-casting").
- **Mac Homebrew tap** (`~/dev/homebrew-webos`, kept) consumes the same
  release artifacts — personal staging/deploy convenience while the channel
  path matures.

## Roadmap

| # | Step | Repo/lane | Status |
|---|------|-----------|--------|
| 1 | webOS cross-compile docs (ABI, container recipe, pulse, soxr, latency) | upstream docs (#1562) | ✅ shipped |
| 2 | SDL2 fallback reframe (fallback-only, latency reality) | `docs/sdl2-focus` branch | ✅ built, awaiting push/PR |
| 3 | armel in release matrix (+ issue per CONTRIBUTING) | `ci/armel-packages` branch + drafts | ✅ built, awaiting go |
| 4 | packaging repo: ipk build script, config UI, manifest, Releases | `malkstar/webos-snapclient` (browser-created) | ✅ scaffolded + build-tested; CI armel proof/payload builder added (interim — retires when upstream ships armel debs); real-TV pass pending |
| 5 | custom channel self-test on the TV | same repo | — |
| 6 | apps-repo PR: `packages/com.github.malkstar.snapclient.yml` (id per their rules) | webosbrew/apps-repo | — |
| 7 | stretch: upstream *endorses* the path — snapcast docs/README link the channel app (upstream still doesn't own webOS packaging; docs point, pipeline repo ships) | upstream docs | 💭 aspirational |

## Packaging design decisions (research-verified Oct 2026)

- **App id**: `com.github.malkstar.snapclient` — the form the apps-repo linter
  itself recommends to non-members; `org.webosbrew.*` is reserved for new
  packages. The id must match in 5 places (yml filename, manifest, appinfo,
  packageinfo, opkg control).
- **Pattern B daemon control** (chosen): the web UI drives the daemon through
  the Homebrew Channel's *public documented* root APIs
  (`org.webosbrew.hbchannel.service/exec`); autostart = symlink into
  `/var/lib/webosbrew/init.d` (run-parts as root at boot). Zero custom native
  code → **the snapclient binary stays byte-identical to the upstream Debian
  armel build**, which is the whole point of the two-repo split. Pattern A
  (registering a Luna service — needs a webOS-NDK-built C launcher) is the
  upgrade path only if maintainers ask for it.
- **No systemd, no opkg postinst** on webOS for this: install = ar/tar-packed
  unsigned `.ipk` (verified against released webosbrew packages); files land
  under `/media/developer/apps`.
- **ipk payload**: app dir carries the UI + `bin/{snapclient,start-daemon.sh,
  stop-daemon.sh,autostart.sh}` + `bin/lib/libsoxr.so*` (LD_LIBRARY_PATH set by
  the start script). `libsoxr` must be bundled in every scenario (upstream
  debs link it dynamically; webOS ships none).
- **License correction**: snapcast is **GPL-3.0** (research subagent said
  GPLv2 — wrong; upstream LICENSE checked). Still fine for `pool: main` as
  long as the manifest carries a reachable `sourceUrl`.
- **armel builder is interim, not institutional** (decided Oct 2026): this
  repo's CI builds armel for two reasons — proof recipe for the upstream
  release PR (commands byte-equivalent to the `ci/armel-packages` proposal)
  and hands-free payload supply. Sequencing: wait for #1562 to land before
  filing the armel issue/PR, then delete the builder as soon as upstream
  publishes armel debs (`build.sh` switches to extracting upstream artifacts).

## Key technical facts (measured/proven this project)

- webOS 5+ ARM TVs = 32-bit armv7 **soft-float** (Debian armel) userland
  despite `uname`=aarch64; verify `readelf -A /bin/sh` (no `Tag_ABI_VFP_args`).
- PulseAudio (system mode) owns TV audio → `--player pulse` is the only
  sync-accurate player; alsa impossible; SDL2 = fallback with no latency API.
- Measured webOS output latency ≈ 85–95 ms vs desktop client → ship
  `--latency ~65` (post-soxr) default in the config UI, adjustable.
- IPK must bundle `libsoxr.so.0.1.2` (+ `libsoxr.so.0` symlink); TV has none.
- IPK build must be pure repackaging **iff** the armel PR lands:
  `wget` upstream deb → unpack → assemble ipk. Cross-toolchain stays out of
  the pipeline repo (only in the fallback path).

## Non-goals / constraints

- No webOS-specific code in snapcast upstream (the #1460 lesson).
- No binaries checked into upstream or apps-repo; binaries live on the
  packaging repo's Releases (channel model) / snapcast Releases (debs).
- GPL-3.0 travels with the payload: packaging repo links sources + recipe.
- Everything upstream posts via: local branches reviewed by user, token is
  read-only (browser does create-PR/issue/repo steps).
