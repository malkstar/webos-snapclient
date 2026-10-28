# Licenses & notices shipped in the .ipk

`build.sh` copies this directory into the installed app payload, together
with the full GPL-3.0 text (`GPL-3.0.txt`, from this repo's `LICENSE`),
because the payload redistributes object code of two works:

| file | covers | provenance |
|---|---|---|
| `snapclient-copyright` | `bin/snapclient` — GNU GPL-3.0-or-later, © Johannes Pohl & contributors (component grants inside, incl. LGPL-2.1+ avahi glue, MIT json.hpp, Zlib base64) | Debian machine-readable copyright from upstream [snapcast](https://github.com/snapcast/snapcast) tag `v0.35.0` (`extras/package/debian/copyright`) |
| `libsoxr-copyright` | `bin/lib/libsoxr.so.0.1.2` — GNU LGPL-2.1-or-later, Rob Sykes | Debian machine-readable copyright from `libsoxr0` 0.1.3-4 (Debian bullseye armel .deb — the same build whose `.so` we ship) |
| `openssl-copyright` | `bin/lib/libssl.so.1.1`, `bin/lib/libcrypto.so.1.1` — OpenSSL/SSLeay dual license | Debian machine-readable copyright from `libssl1.1` 1.1.1w-0+deb11u1 (armel .deb; CI verifies the deb by sha256 before extracting these) |
| `gcc-runtime-copyright` | `bin/lib/libstdc++.so.6`, `bin/lib/libgcc_s.so.1` — GNU GPL-3.0-or-later / GPL-2.0-or-later **with GCC Runtime Library Exception** (free redistribution per the exception) | Debian machine-readable copyright from `libstdc++6` / `libgcc-s1` 10.2.1-6 (armel debs, same sha256-pinned CI source) |
| `LGPL-2.1.txt` | full license text for libsoxr | gnu.org |
| `GPL-3.0.txt` (added at build time) | full license text for snapclient | gnu.org (kept in this repo as `LICENSE`) |

The binaries are unmodified upstream builds. LGPL libraries are shipped as
shared objects (dynamic linking, replaceable), so LGPL §6 object-code
conditions are met by these notices + the source reference below.

**Corresponding complete source (GPL-3.0 §6):** each GitHub release of this
repo that ships the .ipk also attaches the snapcast source snapshot
(`snapcast-source-<rev>.tar.gz`) for the exact revision built; the release's
`build-armel.yml` run / `tools/armel-build-inside.sh` + `build.sh` are the
build scripts that section 6 requires alongside it. Manual builds: state the
built-from revision here and in the release notes.
