# Pre-submission checklist (webosbrew/apps-repo)

Submission = fork apps-repo → add `packages/com.github.malkstar.snapclient.yml`
(content pre-staged in this folder) → PR. Everything below verified against
apps-repo schemas/linters and the Homebrew Channel source (Oct 2026).

## Hard gates (CI lints / rejects)
- [ ] **id consistency** — `com.github.malkstar.snapclient` must match: yml filename,
      manifest `id`, `appinfo.json` id, opkg `Package`. (`org.webosbrew.*` is
      reserved for new packages; don't switch later — orphans installs.)
- [ ] **pool main ⇒ manifest `sourceUrl`** publicly reachable (404 = hard error).
      This repo holds all buildable source incl. the packaging recipe; payload
      source is upstream snapcast (GPL-3.0 — LICENSE shipped here).
- [ ] **manifestUrl always resolves to latest** — GitHub `/releases/latest/download/`
      pattern; never delete old release assets; recompute `ipkHash.sha256` every
      release (install hard-fails on mismatch; hash has no algorithm prefix).
- [ ] **License obligations met** — payload is GPL-3.0 (snapclient) + LGPL-2.1
      (libsoxr): release assets include the corresponding-source snapshot tarball
      (CI attaches it), license texts ship inside the ipk (`licenses/`). The
      apps-repo license expectation for `pool: main` (OSI license + reachable
      `sourceUrl`) is satisfied by the packaging repo + that source asset.
- [ ] **icons**: `iconUri` https + content-type image/*, ≤512 KiB; in-ipk
      `icon.png` 80×80 + `largeIcon.png` 130×130 — REPLACE THE PLACEHOLDERS.
- [ ] `title` ≤30 chars; `category` from enum (multimedia); screenshots are
      only a lint warning if missing (the webOS inspector disables page
      capture, so a camera photo of the TV is the honest way to get one).
- [ ] **ELF symbol verification**: CI runs `webosbrew-ipk-verify` against real
      firmware symbol DBs. Pre-check: `npx @webosbrew/dev-toolbox-cli` →
      `webosbrew-ipk-verify dist/*.ipk`. Our binary is Debian-bullseye-armel
      (glibc 2.31) — set `requirements.webosRelease` honestly; test webOS floor.

## Review-process gates
- [ ] Tested on a real TV (PR template checkbox) — run through the custom
      channel first (README), on YOUR G5 and note the webOS range you claim.
- [ ] AI-use declaration in the PR (project rule #1 rejects AI-slop — declare
      honestly what tooling was used; the code is small and hand-checkable).
- [ ] README rule: no piracy/DRM angle (n/a), no TV-breaking behavior (n/a).

## Design review points (be ready to answer)
- Daemon control is via the Homebrew Channel's **public documented** root exec
  API (`org.webosbrew.hbchannel.service/exec`) — no custom Luna service, no
  elevate-service call; snapclient binary is byte-identical to the upstream
  Debian armel build. (Upgrade path: native Luna service via webOS NDK if
  maintainers prefer.)
- `rootRequired: true`: ALSA/Pulse audio needs escape from the app jail; all
  root actions are the channel's generic exec + init.d autostart convention
  (same pattern as vncserver/wireguard).

## Uninstall caveat (document for users)
Stop in-app + toggle autostart off, or: `pkill -x snapclient; rm -f
/var/lib/webosbrew/init.d/com.github.malkstar.snapclient`. State lives in
`/var/lib/webosbrew/com.github.malkstar.snapclient/`; remove after uninstall.
