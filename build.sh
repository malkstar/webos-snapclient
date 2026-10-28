#!/bin/sh
# build.sh - assemble dist/: webOS .ipk + Homebrew Channel manifest
#
# Payload = an armel (32-bit armv7 soft-float) snapclient built with
# PulseAudio support + its shared libsoxr. Once upstream publishes armel
# debs (pending release-matrix PR), extract them with:
#   dpkg-deb -x snapclient_<v>_armel_bullseye_with-pulse.deb x/   # x/usr/bin/snapclient
#   dpkg-deb -x libsoxr0_<v>_armel.deb y/                         # y/usr/lib/*/libsoxr.so.0*
# Until then, build per upstream doc/build.md "webOS (Cross compile)" and point
# SNAPCLIENT_BIN/LIBSOXR at the result.
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
ID=com.github.malkstar.snapclient
VERSION=${VERSION:-0.35.0}

SNAPCLIENT_BIN=${SNAPCLIENT_BIN:-$SRC/../snapcast/webos-build/snapclient-soxr}
LIBSOXR=${LIBSOXR:-$SRC/../snapcast/webos-build/libsoxr.so.0.1.2}
[ -f "$SNAPCLIENT_BIN" ] || { echo "payload not found: set SNAPCLIENT_BIN (see comments)" >&2; exit 1; }
[ -f "$LIBSOXR" ] || { echo "payload not found: set LIBSOXR" >&2; exit 1; }

MAINT_EMAIL=$(git -C "$SRC" config user.email 2>/dev/null || true)
if [ -z "$MAINT_EMAIL" ]; then
  MAILHOST="users.noreply.""github"".com"
  MAINT_EMAIL="malkstar@$MAILHOST"
fi
MAINTAINER="$(git -C "$SRC" config user.name 2>/dev/null || echo malkstar) <$MAINT_EMAIL>"

BUILD=$SRC/build/stage
rm -rf "$SRC/build" && mkdir -p "$BUILD"
cp -R "$SRC/src/app/." "$BUILD/"
mkdir -p "$BUILD/bin/lib"
cp "$SNAPCLIENT_BIN" "$BUILD/bin/snapclient"
chmod 755 "$BUILD/bin/snapclient"
cp "$LIBSOXR" "$BUILD/bin/lib/"
ln -sf "$(basename "$LIBSOXR")" "$BUILD/bin/lib/libsoxr.so.0"

# webOS ships OpenSSL 3 and an older libstdc++ than the Debian bullseye
# snapclient needs; bundle the armel OpenSSL 1.1 + gcc-10 runtimes.
# RUNTIMELIBS = dir with libssl.so.1.1 libcrypto.so.1.1 libstdc++.so.6
# libgcc_s.so.1 (extract each from its Debian bullseye armel .deb).
RUNTIMELIBS=${RUNTIMELIBS:-$SRC/src/lib/armel}
if [ -d "$RUNTIMELIBS" ]; then
  cp "$RUNTIMELIBS"/*.so.* "$RUNTIMELIBS"/*.so "$BUILD/bin/lib/" 2>/dev/null || true
fi
cp "$SRC"/src/bin/*.sh "$BUILD/bin/"
chmod 755 "$BUILD/bin/"*.sh

# license notices travel with the object code (GPL-3.0 §6 / LGPL-2.1 §4)
cp -R "$SRC/licenses" "$BUILD/licenses"
cp "$SRC/LICENSE" "$BUILD/licenses/GPL-3.0.txt"

# icons referenced by apps-repo/manifest via raw.githubusercontent
ICON_URI="https://raw.githubusercontent.com/malkstar/webos-snapclient/main/src/app/largeIcon.png"
python3 "$SRC/tools/pack_ipk.py" \
  --stagedir "$BUILD" \
  --id "$ID" --version "$VERSION" \
  --title "Snapclient" \
  --description "Snapcast audio client with millisecond-accurate multi-room sync. Configure the server once; runs as a background daemon." \
  --maintainer "$MAINTAINER" \
  --icon-uri "$ICON_URI" \
  --source-url "https://github.com/malkstar/webos-snapclient" \
  --dist "$SRC/dist"

echo "next: publish dist/*.ipk + dist/*.manifest.json as GitHub release v$VERSION (tag v$VERSION), keep assets permanent"
