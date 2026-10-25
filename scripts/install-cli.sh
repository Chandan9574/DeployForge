#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="$ROOT_DIR/cli"

usage() {
  cat <<'EOF'
Usage: scripts/install-cli.sh [options]

Install the DeployForge CLI and make the "deployforge" command available.

Options:
  --global     Link the command through npm's global bin directory
  --no-link    Install dependencies without linking the command
  -h, --help   Show this help message
EOF
}

GLOBAL_LINK=0
LINK_COMMAND=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global) GLOBAL_LINK=1 ;;
    --no-link) LINK_COMMAND=0 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20+ and npm are required." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  echo "Node.js 20+ is required (found $(node -v))." >&2
  exit 1
fi

cd "$CLI_DIR"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
chmod +x bin/deployforge.js

if (( ! LINK_COMMAND )); then
  echo "DeployForge CLI dependencies installed."
  echo "Run: node $CLI_DIR/bin/deployforge.js --help"
  exit 0
fi

if (( GLOBAL_LINK )); then
  npm link
  echo "DeployForge CLI linked globally. Run: deployforge --help"
  exit 0
fi

BIN_DIR="${DEPLOYFORGE_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$BIN_DIR"
ln -sf "$CLI_DIR/bin/deployforge.js" "$BIN_DIR/deployforge"
echo "DeployForge CLI installed at $BIN_DIR/deployforge"

case ":$PATH:" in
  *":$BIN_DIR:"*) echo "Run: deployforge --help" ;;
  *)
    echo "Add $BIN_DIR to your PATH, then run: deployforge --help"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
