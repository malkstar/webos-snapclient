#!/bin/sh
# autostart.sh - executed as root by run-parts /var/lib/webosbrew/init.d at boot
# (symlinked there by the app's "start at boot" toggle)
sleep 8   # let network and the webOS audio stack come up
sh "$(dirname "$(readlink -f "$0")")/start-daemon.sh"
