#!/usr/bin/env bash
# Local TURN server for testing calls: turn:localhost:3478 (UDP/TCP). Synapse hands out credentials made from the shared secret below,
# which is for this machine only. Usage: src/dev/synapse/turn.sh [up|down]   (needs coturn installed: dnf install coturn)
set -euo pipefail
cd "$(dirname "$0")"
SECRET="ohmatrix-dev-turn"
# Its pid and log live next to the other dev tools (outside the repo), not in /tmp, which a restart clears.
RUN="$(cd ../../../.. && pwd)/devtools/work/turn"
mkdir -p "$RUN"
PIDFILE="$RUN/turn.pid"
case "${1:-up}" in
  down)
    # It takes a few seconds to leave after the signal: wait for it, so a start right after is not taken for "already running".
    if [ -f "$PIDFILE" ]; then
      pid="$(cat "$PIDFILE")"
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
      rm -f "$PIDFILE"
    fi
    exit 0 ;;
esac
[ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null && { echo "turn already running"; exit 0; }
nohup turnserver --no-tls --fingerprint --use-auth-secret --static-auth-secret="$SECRET" --realm=localhost \
  --listening-port=3478 --listening-ip=127.0.0.1 --relay-ip=127.0.0.1 --min-port=49160 --max-port=49200 \
  --allow-loopback-peers --no-multicast-peers --pidfile="$PIDFILE" >"$RUN/turn.log" 2>&1 &
sleep 1
echo "turn: localhost:3478"
