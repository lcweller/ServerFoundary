#!/bin/bash
# Run both Next.js and the WebSocket server in one container.
# tini (as PID 1 via the Dockerfile ENTRYPOINT) forwards signals to us,
# and we forward them on to both children.
#
# Uses bash specifically for `wait -n`, which dash (Debian's /bin/sh) lacks.

set -eu

: "${MIGRATE_ON_START:=true}"
: "${SEED_ON_START:=true}"

if [ "${MIGRATE_ON_START}" = "true" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] running database migrations..."
  node dist/migrate.cjs || {
    echo "[entrypoint] migrations failed. Check DATABASE_URL is reachable and has the right credentials."
    exit 1
  }
fi

if [ "${SEED_ON_START}" = "true" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] seeding supported_games catalog..."
  node dist/seed.cjs || echo "[entrypoint] seed failed (non-fatal); continuing."
fi

node dist/ws-server.cjs &
WS_PID=$!

node_modules/.bin/next start &
NEXT_PID=$!

shutdown() {
  kill -TERM "$WS_PID" "$NEXT_PID" 2>/dev/null || true
  wait "$WS_PID" "$NEXT_PID" 2>/dev/null || true
  exit 0
}
trap shutdown INT TERM

# Exit as soon as either child exits so the container restarts on failure.
set +e
wait -n
EXIT_CODE=$?
shutdown
exit $EXIT_CODE
