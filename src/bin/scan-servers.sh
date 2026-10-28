#!/bin/sh
# scan-servers.sh - discover Snapcast servers, mirroring the Android client:
# 1) mDNS browse for _snapcast._tcp (browse -> resolve -> getaddrinfo)
# 2) fallback: TCP sweep of PORT across every globally-connected /24
# Prints one candidate per line: "<ip> <port> <name>"
PORT=${1:-1704}

# --- mDNS browse ----------------------------------------------------------
timeout 5 dns-sd -B _snapcast._tcp local. 2>/dev/null \
  | awk '$2=="Add"{name=$7; for(i=8;i<=NF;i++) name=name" "$i; print name}' \
  | sort -u > /tmp/scan.browse

while IFS= read -r inst; do
  [ -n "$inst" ] || continue
  sp=$(timeout 4 dns-sd -L "$inst" _snapcast._tcp local. </dev/null 2>/dev/null \
       | sed -n -e 's/.*reached at \([^: ]*\):\([0-9][0-9]*\).*/\1 \2/p' \
                -e 's/.*served by \([^: ]*\):\([0-9][0-9]*\).*/\1 \2/p' | head -1)
  [ -n "$sp" ] || continue
  host=$(printf '%s' "$sp" | cut -d' ' -f1)
  p=$(printf '%s' "$sp" | cut -d' ' -f2)
  ip=$(timeout 4 dns-sd -G v4 "$host" </dev/null 2>/dev/null \
      | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/){print $i; exit}}')
  case "$ip" in
    *[!0-9.]*) ip='' ;;
  esac
  [ -n "$ip" ] && echo "$ip $p $inst"
done < /tmp/scan.browse | sort -u > /tmp/scan.mdns

if [ -s /tmp/scan.mdns ]; then
  cat /tmp/scan.mdns
  exit 0
fi

# --- TCP sweep fallback ---------------------------------------------------
ip -4 addr show scope global 2>/dev/null | awk '/inet /{split($2,a,"/"); print a[1]}' \
  | cut -d. -f1-3 | sort -u > /tmp/scan.nets
while IFS= read -r net; do
  [ -n "$net" ] || continue
  i=1; j=0
  while [ "$i" -le 254 ]; do
    ( timeout 2 nc "$net.$i" "$PORT" >/dev/null 2>&1 && echo "$net.$i $PORT tcp-open" ) &
    j=$((j + 1)); [ $((j % 48)) -eq 0 ] && wait
    i=$((i + 1))
  done
  wait
done < /tmp/scan.nets | sort -u
