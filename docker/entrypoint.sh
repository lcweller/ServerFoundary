#!/bin/sh
# Run both Next.js and the WebSocket server in one container.
# tini (as PID 1 via the Dockerfile ENTRYPOINT) forwards signals to us,
# and we forward them on to both children.

set -eu

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
