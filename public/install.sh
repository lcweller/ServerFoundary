#!/usr/bin/env bash
# GameServerOS agent installer.
# Usage: curl -fsSL <dashboard>/install.sh | sudo bash -s -- <dashboard> <token>

set -euo pipefail

DASHBOARD_URL="${1:-}"
ENROLLMENT_TOKEN="${2:-}"

AGENT_USER="gameserveros"
AGENT_HOME="/opt/gameserveros"
AGENT_BIN_DIR="${AGENT_HOME}/bin"
AGENT_BIN="${AGENT_BIN_DIR}/agent.cjs"
SERVERS_DIR="${AGENT_HOME}/servers"
CONFIG_DIR="/etc/gameserveros"
CONFIG_FILE="${CONFIG_DIR}/agent.env"
SERVICE_FILE="/etc/systemd/system/gameserveros-agent.service"

say()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33mwarn:\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31merror:\033[0m %s\n" "$*" >&2; exit 1; }

# --- Sanity checks ----------------------------------------------------------

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  die "This installer must be run as root. Try: sudo bash -s -- ${DASHBOARD_URL} ${ENROLLMENT_TOKEN}"
fi

[[ -n "${DASHBOARD_URL}" ]] || die "Missing dashboard URL. Usage: install.sh <dashboard-url> <token>"
[[ -n "${ENROLLMENT_TOKEN}" ]] || die "Missing enrollment token."

if [[ ! -r /etc/os-release ]]; then
  die "Cannot read /etc/os-release. This installer supports Ubuntu and Debian."
fi

. /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in
  ubuntu:*|debian:*|*:*ubuntu*|*:*debian*) : ;;
  *) die "Unsupported distribution: ${PRETTY_NAME:-unknown}. This installer supports Ubuntu and Debian." ;;
esac

say "Detected ${PRETTY_NAME}"

export DEBIAN_FRONTEND=noninteractive

# --- Dependencies -----------------------------------------------------------

say "Installing base packages (curl, ca-certificates, gnupg)"
apt-get update -y -qq
apt-get install -y -qq --no-install-recommends \
  curl \
  wget \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  ufw \
  || die "Failed to install base packages."

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed -E 's/v([0-9]+).*/\1/')" -lt 18 ]]; then
  say "Installing Node.js 18 LTS from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -  >/dev/null 2>&1 \
    || die "Failed to add the NodeSource apt repo."
  apt-get install -y -qq nodejs || die "Failed to install Node.js."
fi

NODE_VERSION="$(node -v)"
say "Node.js ${NODE_VERSION} is available"

say "Installing 32-bit libs for SteamCMD"
dpkg --add-architecture i386 >/dev/null 2>&1 || true
apt-get update -y -qq
apt-get install -y -qq --no-install-recommends \
  lib32gcc-s1 \
  lib32stdc++6 \
  || warn "Failed to install some 32-bit libs. SteamCMD may not work without them."

install_steamcmd_package() {
  # steamcmd lives in the 'multiverse' component on Ubuntu. Accept the Steam EULA.
  add-apt-repository -y multiverse >/dev/null 2>&1 || true
  apt-get update -y -qq
  echo steam steam/question select "I AGREE" | debconf-set-selections
  echo steam steam/license note "" | debconf-set-selections
  apt-get install -y -qq --no-install-recommends steamcmd || return 1
  return 0
}

install_steamcmd_manual() {
  say "Installing SteamCMD manually to /opt/steamcmd"
  mkdir -p /opt/steamcmd
  cd /opt/steamcmd
  curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz \
    | tar -xz || return 1
  ln -sf /opt/steamcmd/steamcmd.sh /usr/local/bin/steamcmd
  cd /
  return 0
}

if ! command -v steamcmd >/dev/null 2>&1; then
  say "Installing SteamCMD"
  if ! install_steamcmd_package; then
    warn "Package install failed; falling back to manual."
    install_steamcmd_manual || warn "SteamCMD install failed. Game servers won't be able to download until this is fixed."
  fi
else
  say "SteamCMD already installed"
fi

# --- User and directories ---------------------------------------------------

if ! id "${AGENT_USER}" >/dev/null 2>&1; then
  say "Creating system user '${AGENT_USER}'"
  useradd --system --create-home --home-dir "${AGENT_HOME}" --shell /bin/bash "${AGENT_USER}" \
    || die "Failed to create ${AGENT_USER} user."
fi

mkdir -p "${AGENT_BIN_DIR}" "${SERVERS_DIR}" "${CONFIG_DIR}"
chown -R "${AGENT_USER}:${AGENT_USER}" "${AGENT_HOME}"
chown -R "${AGENT_USER}:${AGENT_USER}" "${CONFIG_DIR}"
chmod 750 "${CONFIG_DIR}"

# --- Download the agent -----------------------------------------------------

say "Downloading agent bundle"
TMP_BIN="$(mktemp)"
trap 'rm -f "${TMP_BIN}"' EXIT
curl -fsSL "${DASHBOARD_URL%/}/agent.cjs" -o "${TMP_BIN}" \
  || die "Failed to download agent.cjs from ${DASHBOARD_URL}. Is the dashboard reachable?"
install -m 0755 -o "${AGENT_USER}" -g "${AGENT_USER}" "${TMP_BIN}" "${AGENT_BIN}"

# --- Enroll -----------------------------------------------------------------

say "Enrolling host with dashboard"
ENROLL_BODY="$(printf '{"token":"%s"}' "${ENROLLMENT_TOKEN}")"
ENROLL_RESP="$(curl -fsS -X POST \
  -H "content-type: application/json" \
  --data "${ENROLL_BODY}" \
  "${DASHBOARD_URL%/}/api/v1/agent/enroll")" \
  || die "Enrollment request failed. Is your token valid and unexpired?"

extract_json() {
  printf '%s' "$1" | grep -oE "\"$2\":\"[^\"]+\"" | head -1 | sed -E "s/\"$2\":\"([^\"]+)\"/\\1/"
}

API_KEY="$(extract_json "${ENROLL_RESP}" apiKey)"
HOST_ID="$(extract_json "${ENROLL_RESP}" hostId)"
WS_URL="$(extract_json "${ENROLL_RESP}" wsUrl)"
[[ -n "${API_KEY}" ]] || die "Dashboard did not return an API key. Response: ${ENROLL_RESP}"
[[ -n "${HOST_ID}" ]] || die "Dashboard did not return a host ID. Response: ${ENROLL_RESP}"

say "Writing configuration to ${CONFIG_FILE}"
umask 077
cat > "${CONFIG_FILE}" <<EOF
# Managed by GameServerOS installer. Do not edit by hand.
DASHBOARD_URL=${DASHBOARD_URL%/}
API_KEY=${API_KEY}
HOST_ID=${HOST_ID}
WS_URL=${WS_URL}
EOF
chown "${AGENT_USER}:${AGENT_USER}" "${CONFIG_FILE}"
chmod 600 "${CONFIG_FILE}"

# --- systemd service --------------------------------------------------------

say "Installing systemd service"
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=GameServerOS Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${AGENT_USER}
EnvironmentFile=${CONFIG_FILE}
Environment=GAMESERVEROS_CONFIG=${CONFIG_FILE}
Environment=GAMESERVEROS_SERVERS_DIR=${SERVERS_DIR}
ExecStart=$(command -v node) ${AGENT_BIN}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gameserveros-agent.service \
  || die "Failed to start the gameserveros-agent service. Run 'journalctl -u gameserveros-agent' for details."

# --- UFW firewall -----------------------------------------------------------

if command -v ufw >/dev/null 2>&1; then
  if ! ufw status | grep -q "Status: active"; then
    say "Enabling ufw firewall"
    ufw --force default deny incoming >/dev/null
    ufw --force default allow outgoing >/dev/null
    ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
    yes | ufw enable >/dev/null 2>&1 || true
  fi
fi

say "Installation complete. The agent should appear in your dashboard within 30 seconds."
printf "\n"
printf "  Service:   systemctl status gameserveros-agent\n"
printf "  Logs:      journalctl -u gameserveros-agent -f\n"
printf "  Config:    %s\n" "${CONFIG_FILE}"
printf "\n"
