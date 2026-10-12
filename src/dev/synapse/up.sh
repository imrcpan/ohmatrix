#!/usr/bin/env bash
# Local Synapse for development/testing: http://localhost:8008, server name "localhost".
# Seeds user  test / 123456  (plus alice, bob / 123456). Data lives in src/dev/synapse/data (gitignored).
# Usage: src/dev/synapse/up.sh [down|reset]
set -euo pipefail
cd "$(dirname "$0")"
NAME=ohmatrix-synapse
IMAGE=matrixdotorg/synapse:latest
DATA="$PWD/data"
DOCKER=${DOCKER:-docker}
mkdir -p "$DATA"
# Run synapse as the owner of the data dir so its files stay editable on the host.
IDS="-e UID=$(stat -c %u "$DATA") -e GID=$(stat -c %g "$DATA")"

case "${1:-up}" in
  down)  $DOCKER rm -f $NAME >/dev/null 2>&1 || true; exit 0 ;;
  reset) $DOCKER rm -f $NAME >/dev/null 2>&1 || true; $DOCKER run --rm -v "$DATA:/data" --entrypoint rm $IMAGE -rf /data/homeserver.yaml /data/homeserver.db /data/media_store /data/localhost.signing.key /data/localhost.log.config; ;;
esac

mkdir -p "$DATA"
if [ ! -f "$DATA/homeserver.yaml" ]; then
  $DOCKER run --rm $IDS -v "$DATA:/data" -e SYNAPSE_SERVER_NAME=localhost -e SYNAPSE_REPORT_STATS=no $IMAGE generate
  cat >> "$DATA/homeserver.yaml" <<'YAML'

# --- dev overrides ---
registration_shared_secret: "ohmatrix-dev-secret"
enable_registration: false
user_directory:
  enabled: true
  search_all_users: true
rc_message: { per_second: 1000, burst_count: 1000 }
rc_login:
  address: { per_second: 1000, burst_count: 1000 }
  account: { per_second: 1000, burst_count: 1000 }
  failed_attempts: { per_second: 1000, burst_count: 1000 }
rc_registration: { per_second: 1000, burst_count: 1000 }
rc_room_creation: { per_second: 1000, burst_count: 1000 }
rc_invites:
  per_room: { per_second: 1000, burst_count: 1000 }
  per_user: { per_second: 1000, burst_count: 1000 }
  per_issuer: { per_second: 1000, burst_count: 1000 }
rc_key_requests: { per_second: 1000, burst_count: 1000 }
rc_3pid_validation: { per_second: 1000, burst_count: 1000 }
rc_joins:
  local: { per_second: 1000, burst_count: 1000 }
YAML
fi

$DOCKER rm -f $NAME >/dev/null 2>&1 || true
$DOCKER run -d --name $NAME $IDS -p 127.0.0.1:8008:8008 -v "$DATA:/data" $IMAGE >/dev/null
printf 'waiting for synapse'
for _ in $(seq 60); do curl -sf http://localhost:8008/health >/dev/null && break; printf .; sleep 1; done; echo

for u in test alice bob; do
  $DOCKER exec $NAME register_new_matrix_user -c /data/homeserver.yaml -u $u -p 123456 --no-admin http://localhost:8008 2>&1 | grep -v "already in use" || true
done
echo "ready: http://localhost:8008  users: test/alice/bob  password: 123456"
