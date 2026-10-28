#!/bin/bash
# Run INSIDE multiarch/debian-debootstrap:armel-bullseye (mounted layout:
# workspace at /build, snapcast checkout at /build/upstream, cwd there).
#
# The apt/gh/build command sequences below are copied step-for-step from the
# armel job of the upstream package.yml proposal (branch ci/armel-packages of
# malkstar/snapcast, +27/-0 vs snapcast/snapcast develop), so a successful run
# of this script is evidence for that PR — "recipe proven", not "a similar
# recipe works". Intentional deltas, each marked below:
#   - REVISION comes from the checked-out snapcast commit, not github.sha
#     (here that sha would belong to this repo);
#   - caches live in ${PARENT_DIR}/cache (boost tree + ccache dir), which the
#     calling workflow persists between runs via actions/cache — the
#     equivalent of upstream's boost/ccache caches on its self-hosted runner
#     (there they ride on the persistent machine; hosted runners are
#     ephemeral, so the persistence moves to the workflow layer);
#   - `apt-get download libsoxr0` added: the ipk payload bundles the runtime
#     lib (webOS ships none) and this container is the natural place to fetch
#     the armel .deb;
#   - client-only build: -DBUILD_SERVER=OFF + DH_OPTIONS=-Nsnapserver skip the
#     snapserver half (never part of this repo's payload; the repo ships the
#     client alone), which also drops the server-only snapweb asset download.
#     Purely build-time; the armel recipe under proof (container, apt pin, gh
#     tarball, ABI) is untouched. If a future debhelper rejects the package
#     selection, delete those two marks and the server debs reappear harmlessly.
#   - final self-check asserts the produced ELF really is 32-bit ARM
#     soft-float (no Tag_CPU_arch assertion; see self-check comment).
# Do not "improve" anything else without mirroring it into the upstream PR.
set -eu

export DEBIAN_FRONTEND=noninteractive
: "${GH_VERSION:?}"; : "${BOOST_VERSION:?}"; : "${REVISION:?}"
GITHUB_WORKSPACE=${GITHUB_WORKSPACE:-/build/upstream}; export GITHUB_WORKSPACE
PARENT_DIR=$(dirname "$GITHUB_WORKSPACE")
export PARENT_DIR
# upstream puts ccache at /home/runner/.ccache (persistent runner); here the
# workflow layer persists ${PARENT_DIR}/cache instead (header note)
export CCACHE_DIR="${PARENT_DIR}/cache/ccache"

ARCH=armel
DEBIAN=bullseye
# client-only: legacy rules would otherwise run binary stages for both packages
export DH_OPTIONS="-Nsnapserver"

# ---- step "Use archive.debian.org (armel was retired after bullseye)"
printf 'deb http://archive.debian.org/debian %s main\n' "$DEBIAN" > /etc/apt/sources.list
printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid-until

# ---- step "Get dependencies" (identical list to package.yml)
sed -i -e 's/MODULES=dep/MODULES=most/g' /etc/initramfs-tools/initramfs.conf || true
apt-get update && \
apt-get install -yq wget debhelper build-essential cmake git rename \
libatomic1 libasound2-dev libsoxr-dev libvorbisidec-dev libvorbis-dev libflac-dev \
libopus-dev alsa-utils libpulse-dev libavahi-client-dev avahi-daemon libexpat1-dev \
libssl-dev libpipewire-0.3-dev python3 ccache unzip debhelper
# git exists only from here on (base image is a bare debootstrap userland)
git config --global --add safe.directory "$GITHUB_WORKSPACE"
# delta (see header): the bare image lacks bzip2, which tar needs for the
# .tar.bz2 boost archive in the "Get boost" step below
apt-get install -yq bzip2

# ---- addition (see header): runtime libsoxr as armel .deb for the ipk payload
apt-get download libsoxr0

# ---- step "Get GitHub cli (armel)": gh's apt repo publishes no armel packages
# (binary-armel 404s), so use the statically linked armv6 binary archive.
# Not needed by this script itself; installed to prove the upstream step works.
GH_DOT_VERSION=${GH_VERSION#v}
wget -qO- "https://github.com/cli/cli/releases/download/${GH_VERSION}/gh_${GH_DOT_VERSION}_linux_armv6.tar.gz" \
  | tar xz -C /usr/local --strip-components=1
gh --version

# ---- step "Setup environment"
BOOST_DOT_VERSION=$(echo ${BOOST_VERSION} | sed 's/_/./g')
export BOOST_DOT_VERSION
BOOST=boost_${BOOST_VERSION}
ln -s extras/package/debian debian

# ---- step "Create changelog"
$GITHUB_WORKSPACE/debian/changelog_md2deb.py $GITHUB_WORKSPACE/changelog.md > $GITHUB_WORKSPACE/debian/changelog
cat $GITHUB_WORKSPACE/debian/changelog

# ---- step "Clean up"
rm -rf ${PARENT_DIR}/snap*_*.deb

# ---- step "Get boost" + upstream's "Cache boost" (see header: cache dir is
# restored/persisted by the workflow layer; we reuse it when present)
BOOST_ROOT_DIR=${PARENT_DIR}/cache/${BOOST}
if [ ! -f "$BOOST_ROOT_DIR/boost/version.hpp" ]; then
  mkdir -p ${PARENT_DIR}/cache && cd ${PARENT_DIR}/cache
  wget -q https://archives.boost.io/release/${BOOST_DOT_VERSION}/source/${BOOST}.tar.bz2
  tar xjf ${BOOST}.tar.bz2 && rm ${BOOST}.tar.bz2
  cd "$GITHUB_WORKSPACE"
fi

# ---- step "Get Snapweb": SKIPPED — snapweb is embedded into snapserver only;
# this repo builds the client alone (see header delta), so the asset is unused.

# ---- step "Create deb package" (variants selected by VARIANT=pulse|all)
CMAKE_COMMON="-DCMAKE_CXX_COMPILER_LAUNCHER=ccache -DBOOST_ROOT=${BOOST_ROOT_DIR} -DCMAKE_BUILD_TYPE:STRING=Release -DREVISION=${REVISION} -DBUILD_SERVER=OFF"
VARIANT=${VARIANT:-pulse}

if [ "$VARIANT" = all ]; then
  # plain variant + rename, exactly as upstream
  fakeroot make -f debian/rules CMAKEFLAGS="$CMAKE_COMMON" binary
  rename "s/_${ARCH}/_${ARCH}_${DEBIAN}/g" ../snap*_${ARCH}.deb
  fakeroot make -f debian/rules clean
fi

# with-pulse variant: the one webOS uses (PulseAudio in system mode)
fakeroot make -f debian/rules CMAKEFLAGS="$CMAKE_COMMON -DBUILD_WITH_PULSE=ON" binary
rm -f ../snapserver_*_${ARCH}.deb   # no-op when server build is off
rename "s/_${ARCH}/_${ARCH}_${DEBIAN}_with-pulse/g" ../snap*_${ARCH}.deb

if [ "$VARIANT" = all ]; then
  fakeroot make -f debian/rules clean
  # pipewire variant + rename, exactly as upstream (the glob only matches the
  # fresh build because earlier outputs were already renamed away from *_armel.deb)
  fakeroot make -f debian/rules CMAKEFLAGS="$CMAKE_COMMON -DBUILD_WITH_PIPEWIRE=ON" binary
  rename "s/_${ARCH}/_${ARCH}_${DEBIAN}_with-pipewire/g" ../snap*_${ARCH}.deb
fi

# ---- self-check: the whole point of armel — 32-bit ARM WITHOUT hard-float.
# Do not assert Tag_CPU_arch: the Debian armel baseline is ARMv4T and the
# bullseye armel toolchain stamps no .ARM.attributes at all (verified on the
# built deb); webOS TVs are ARMv7 CPUs running any 32-bit soft-float subset
# backward-compatibly. Load-bearing property = ELF32 + ARM + no
# Tag_ABI_VFP_args (the latter holds vacuously when no attributes exist).
SNAPCLIENT_DEB=$(echo ${PARENT_DIR}/snapclient_*_${ARCH}_${DEBIAN}_with-pulse.deb)
dpkg-deb -x "$SNAPCLIENT_DEB" /tmp/debcheck
BIN=/tmp/debcheck/usr/bin/snapclient
readelf -h "$BIN" | tee /dev/stderr | grep -q 'Class: *ELF32'    # 32-bit
readelf -h "$BIN" | grep -q 'Machine: *ARM'                       # ARM (not AArch64)
if readelf -A "$BIN" | grep -q 'Tag_ABI_VFP_args'; then
  echo "FATAL: binary has Tag_ABI_VFP_args -> hard-float (armhf), cannot run on webOS" >&2
  exit 1
fi
ldd "$BIN" | grep libsoxr                                      # runtime libsoxr => payload must bundle it
echo "OK: $SNAPCLIENT_DEB is 32-bit ARM soft-float (Debian armel)"
