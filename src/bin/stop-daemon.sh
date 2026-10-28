#!/bin/sh
# stop-daemon.sh - kill the snapclient daemon (autostart, if enabled, re-starts it at next boot)
pkill -x snapclient || true
