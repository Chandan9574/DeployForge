#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BLUE=$'\033[34m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
else
  C_RESET=""
  C_BLUE=""
  C_GREEN=""
  C_YELLOW=""
  C_RED=""
fi

log() { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok() { printf '%s==>%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s==>%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() {
  printf '%s==>%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap.sh [options]

Prepare a fresh clone of DeployForge.

Options:
  --no-install    Skip npm dependency installation
  --no-mongo      Do not start the local MongoDB container
  --skip-docker-permission-check
                  Do not verify Docker access (useful for mock-Docker development)
  -h, --help      Show this help message
EOF
}

START_MONGO=1
INSTALL_DEPS=1
CHECK_DOCKER_PERMISSIONS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-install) INSTALL_DEPS=0 ;;
    --no-mongo) START_MONGO=0 ;;
    --skip-docker-permission-check) CHECK_DOCKER_PERMISSIONS=0 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done

need_cmd() { command -v "$1" >/dev/null 2>&1; }

configure_docker_access() {
  if docker info >/dev/null 2>&1; then
    ok "Docker daemon is accessible"
    return 0
  fi

  if (( ! CHECK_DOCKER_PERMISSIONS )); then
    warn "Docker is not accessible; permission check skipped"
    return 0
  fi

  if ! getent group docker >/dev/null 2>&1; then
    die "Docker is installed but the 'docker' group does not exist. Start Docker first, then re-run this script."
  fi

  if id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
    die "Your account is in the docker group, but this shell has not picked up that membership. Sign out and back in, then re-run this script."
  fi

  if ! need_cmd sudo; then
    die "Docker requires permission to access /var/run/docker.sock. Add '$USER' to the docker group as an administrator, then sign out and back in."
  fi

  log "Granting $USER access to Docker"
  sudo usermod -aG docker "$USER"
  die "Docker access was granted. Sign out and back in (or run 'newgrp docker'), then re-run this script."
}

log "Checking prerequisites"

missing=0

if need_cmd node; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( node_major < 20 )); then
    warn "Node.js 20+ is required (found $(node -v))."
    missing=1
  else
    ok "Node.js $(node -v)"
  fi
else
  warn "Node.js 20+ is required but 'node' was not found."
  missing=1
fi

if need_cmd npm; then
  ok "npm $(npm -v)"
else
  warn "'npm' was not found."
  missing=1
fi

if need_cmd git; then
  ok "git $(git --version | awk '{print $3}')"
else
  warn "'git' is required for branch deployments but was not found."
  missing=1
fi

if need_cmd docker; then
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
  configure_docker_access
else
  warn "'docker' is required to run deployments but was not found. Install Docker and re-run this script."
  missing=1
fi

if need_cmd nginx; then
  ok "nginx found"
else
  warn "nginx not found (optional; only needed when NGINX_ENABLED=true)"
fi

(( missing == 0 )) || die "Install the missing requirements above and re-run this script."

if (( INSTALL_DEPS )); then
  for app in backend frontend; do
    log "Installing $app dependencies"
    if [[ -f "$app/package-lock.json" ]]; then
      npm --prefix "$app" ci
    else
      npm --prefix "$app" install
    fi
  done
  ok "JavaScript dependencies installed"
else
  warn "Skipping dependency installation (--no-install)"
fi

if [[ ! -f backend/.env ]]; then
  install -m 600 backend/.env.example backend/.env
  ok "Created backend/.env from backend/.env.example"
else
  chmod 600 backend/.env
  ok "backend/.env already exists; leaving it unchanged"
fi

if [[ -t 0 ]]; then
  printf '\nAgent37 deployment intelligence is optional.\n'
  printf 'Agent37 API key (press Enter to skip): '
  read -r -s agent37_api_key
  printf '\n'
  if [[ -n "$agent37_api_key" ]]; then
    if [[ "$agent37_api_key" == *$'\n'* || "$agent37_api_key" == *$'\r'* ]]; then
      die "Agent37 API keys cannot contain line breaks"
    fi
    printf '\nAGENT37_ENABLED=true\nAGENT37_API_KEY=%s\n' "$agent37_api_key" >> backend/.env
    chmod 600 backend/.env
    ok "Agent37 API key saved to backend/.env"
  else
    warn "Agent37 setup skipped. Configure it later from the dashboard."
  fi
fi

mkdir -p backend/deployments /tmp/deployforge-builds
chmod 700 backend/deployments /tmp/deployforge-builds
ok "Prepared private deployment and build workspaces"

if (( START_MONGO )); then
  if ! docker info >/dev/null 2>&1; then
    warn "Docker daemon is not running; skipping MongoDB startup"
  elif (echo >/dev/tcp/127.0.0.1/27017) >/dev/null 2>&1; then
    ok "MongoDB is already reachable on localhost:27017"
  else
    if docker inspect deployforge-mongodb >/dev/null 2>&1; then
      if [[ "$(docker inspect -f '{{.State.Running}}' deployforge-mongodb)" == "true" ]]; then
        ok "MongoDB container is already running"
      else
        log "Starting existing MongoDB container"
        docker start deployforge-mongodb >/dev/null
      fi
    else
      log "Creating MongoDB container"
      if docker compose version >/dev/null 2>&1; then
        docker compose up -d mongodb
      else
        docker run -d --name deployforge-mongodb \
          -p 27017:27017 \
          -v deployforge-mongo:/data/db \
          mongo:7 >/dev/null
      fi
    fi

    ready=0
    for _ in {1..30}; do
      if docker exec deployforge-mongodb mongosh --quiet \
        --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep 1
    done

    if (( ready )); then
      ok "MongoDB is ready on localhost:27017"
    else
      warn "MongoDB container started but did not respond yet; check 'docker logs deployforge-mongodb'"
    fi
  fi
else
  warn "Skipping MongoDB startup (--no-mongo)"
fi

printf '\n%sBootstrap complete.%s\n' "$C_GREEN" "$C_RESET"
printf 'Next steps:\n'
printf '  1. Start the backend:  npm run backend:dev\n'
printf '  2. Start the frontend: npm run frontend:dev\n'
printf '  3. Open the dashboard: http://localhost:5173\n'
