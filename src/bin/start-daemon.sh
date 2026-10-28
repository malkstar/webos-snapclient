#!/bin/sh
# start-daemon.sh - launch snapclient as a background daemon
# (invoked by the app UI through Homebrew Channel exec, or by autostart.sh at boot)
#
# snapclient daemonizes itself (--daemon = fork + nice -3) and writes its own
# log (--logsink file:), so no nohup wrapper is needed and the process lands
# directly under init.
BIN_DIR=$(cd "$(dirname "$0")" && pwd)
STATE=/var/lib/webosbrew/com.github.malkstar.snapclient
SERVER=''
PORT=1704
PLAYER=pulse
LATENCY=65
[ -f "$STATE/config" ] && . "$STATE/config"
[ -n "$SERVER" ] || { echo "no server configured ($STATE/config)" >&2; exit 1; }
mkdir -p "$STATE"
LOG="$STATE/snapclient.log"

# the file sink does not rotate; keep the log bounded before (re)start
if [ -f "$LOG" ]; then
  SZ=$(wc -c < "$LOG" 2>/dev/null || echo 0)
  [ "$SZ" -gt 204800 ] && { tail -c 102400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }
fi

export LD_LIBRARY_PATH="$BIN_DIR/lib"
pkill -x snapclient 2>/dev/null
sleep 1
# webOS-specific: --latency compensates the measured TV audio-pipeline delay
# (65 ms on LG G5); pulse is the only sync-accurate player on webOS.
"$BIN_DIR/snapclient" --host "$SERVER" --port "$PORT" --player "$PLAYER" --latency "$LATENCY" \
  --daemon --logsink "file:$LOG"
rc=$?
[ $rc -eq 0 ] || echo "$(date): snapclient failed to start (rc=$rc)" >> "$LOG"
exit $rc
