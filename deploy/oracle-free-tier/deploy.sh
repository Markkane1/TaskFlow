#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${APP_DIR}/.env"
SERVICE_NAME="taskflow"
RUN_USER="${SUDO_USER:-$USER}"
PUBLIC_URL="${1:-}"

run_sudo() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

set_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  local escaped

  escaped="$(printf '%s' "${value}" | sed -e 's/[&|]/\\&/g')"
  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|g" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

read_env() {
  local key="$1"
  local file="$2"
  local value
  value="$(grep -E "^${key}=" "${file}" | head -n 1 | cut -d= -f2- || true)"
  printf '%s' "${value}"
}

echo "[1/7] Installing OS packages"
run_sudo apt-get update -y
run_sudo apt-get install -y curl git ca-certificates build-essential

echo "[2/7] Ensuring Node.js 20+"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(\".\")[0]')" -lt 20 ]]; then
  if [[ "${EUID}" -eq 0 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  fi
  run_sudo apt-get install -y nodejs
fi

echo "[3/7] Installing npm dependencies and building frontend"
cd "${APP_DIR}"
npm ci
npm run build

echo "[4/7] Preparing .env"
if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${APP_DIR}/.env.example" "${ENV_FILE}"
fi

if [[ -z "${PUBLIC_URL}" ]]; then
  PUBLIC_IP="$(curl -fsSL https://api.ipify.org || true)"
  if [[ -n "${PUBLIC_IP}" ]]; then
    PUBLIC_URL="http://${PUBLIC_IP}:3000"
  else
    PUBLIC_URL="http://localhost:3000"
  fi
fi

set_env "NODE_ENV" "production" "${ENV_FILE}"
set_env "PORT" "3000" "${ENV_FILE}"
set_env "CLIENT_URL" "${PUBLIC_URL}" "${ENV_FILE}"

if [[ "${PUBLIC_URL}" == https://* ]]; then
  set_env "COOKIE_SECURE" "true" "${ENV_FILE}"
else
  set_env "COOKIE_SECURE" "false" "${ENV_FILE}"
fi

CURRENT_JWT="$(read_env "JWT_SECRET" "${ENV_FILE}")"
if [[ "${#CURRENT_JWT}" -lt 32 || "${CURRENT_JWT}" == "replace-with-at-least-32-characters-random-secret" ]]; then
  set_env "JWT_SECRET" "$(openssl rand -hex 32)" "${ENV_FILE}"
fi

CURRENT_ADMIN_PASSWORD="$(read_env "SEED_ADMIN_PASSWORD" "${ENV_FILE}")"
if [[ -z "${CURRENT_ADMIN_PASSWORD}" || "${CURRENT_ADMIN_PASSWORD}" == "admin123456789" ]]; then
  GENERATED_ADMIN_PASSWORD="Admin_$(openssl rand -hex 12)"
  set_env "SEED_ADMIN_PASSWORD" "${GENERATED_ADMIN_PASSWORD}" "${ENV_FILE}"
else
  GENERATED_ADMIN_PASSWORD=""
fi

echo "[5/7] Configuring systemd service (${SERVICE_NAME})"
NPM_BIN="$(command -v npm)"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
run_sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=TaskFlow
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${NPM_BIN} run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo "[6/7] Starting service"
run_sudo systemctl daemon-reload
run_sudo systemctl enable --now "${SERVICE_NAME}"

echo "[7/7] Deployment summary"
echo "TaskFlow URL: ${PUBLIC_URL}"
echo "Service name: ${SERVICE_NAME}"
echo "Service status: sudo systemctl status ${SERVICE_NAME}"
if [[ -n "${GENERATED_ADMIN_PASSWORD}" ]]; then
  echo "Generated SEED_ADMIN_PASSWORD: ${GENERATED_ADMIN_PASSWORD}"
  echo "Save this password and rotate it after first login."
fi
echo "Remember to allow TCP 3000 in Oracle VCN Security List + NSG."
