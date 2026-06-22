#!/usr/bin/env bash
# scripts/install.sh
# One-shot installer for newest-desktop-control.
#
# What it does:
#   1. Detects the OS (macOS, Linux, Windows-via-git-bash).
#   2. Checks Node.js (>=18), Python 3, pip, and (optionally) ADB.
#   3. Installs the Python dependencies from requirements.txt.
#   4. Runs the test suite as a smoke test.
#   5. Prints a ready-to-paste MCP config snippet for your agent framework.
#
# Usage:
#   bash scripts/install.sh                    # install + smoke test + print config
#   bash scripts/install.sh --no-tests         # skip the npm test run
#   bash scripts/install.sh --target hermes    # pick a specific config target
#   bash scripts/install.sh --target codex --path /opt/ndc/src/server.js
#   bash scripts/install.sh --no-config       # do not print MCP config
#
# Supported targets: openclaw, hermes, codex, claude-desktop, mcp-json, all
# (See scripts/setup-config.js for details.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- arg parsing -----------------------------------------------------------
RUN_TESTS=1
PRINT_CONFIG=1
TARGET="openclaw"
CUSTOM_PATH=""

usage() {
  cat <<'EOF'
install.sh — install + verify newest-desktop-control

Usage:
  bash scripts/install.sh [options]

Options:
  --no-tests              Skip the npm test smoke check
  --no-config             Do not print the MCP config snippet at the end
  --target <name>         Config target: openclaw, hermes, codex, claude-desktop, mcp-json, all
                         (default: openclaw)
  --path <file>           Override the server.js path used in the printed config
  --help, -h              Show this help

Examples:
  bash scripts/install.sh
  bash scripts/install.sh --target hermes
  bash scripts/install.sh --target codex --no-tests
  bash scripts/install.sh --path /opt/newest-desktop-control/src/server.js
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-tests)   RUN_TESTS=0; shift ;;
    --no-config)  PRINT_CONFIG=0; shift ;;
    --target)     TARGET="${2:-openclaw}"; shift 2 ;;
    --path)       CUSTOM_PATH="${2:-}"; shift 2 ;;
    --help|-h)    usage; exit 0 ;;
    *)            echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

# --- helpers ---------------------------------------------------------------
log()  { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[install]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[install]\033[0m %s\n' "$*" >&2; }

detect_os() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)  echo "macos" ;;
    Linux)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

PYTHON_BIN="python3"
[[ "$(detect_os)" == "windows" ]] && PYTHON_BIN="python"

command_exists() { command -v "$1" >/dev/null 2>&1; }

# --- 1. OS / preflight -----------------------------------------------------
OS="$(detect_os)"
log "Detected OS: $OS"
log "Repo root:   $REPO_ROOT"

for tool in node "$PYTHON_BIN" pip pip3; do
  if command_exists "$tool"; then
    log "Found $tool: $(command -v "$tool")"
  fi
done

# Resolve pip as an argv-style array so spaces (e.g. "python3 -m pip") survive.
PIP_ARGS=()
if command_exists pip; then
  PIP_ARGS=(pip)
elif command_exists pip3; then
  PIP_ARGS=(pip3)
elif "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
  log "Found pip via '$PYTHON_BIN -m pip'"
  PIP_ARGS=("$PYTHON_BIN" -m pip)
else
  err "Missing required tool: pip / pip3 / python3 -m pip"
  err "  pip is bundled with Python 3.4+. If missing: $PYTHON_BIN -m ensurepip"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  err "Node.js $NODE_MAJOR detected. Need >= 18."
  exit 1
fi
log "Node.js major version: $NODE_MAJOR (>= 18 ✓)"

if command_exists adb; then
  log "Found adb: $(command -v adb) — Android controls will work"
  adb devices -l 2>/dev/null | head -5 || true
else
  warn "adb not found. Android controls will be unavailable (desktop still works)."
fi

# --- 2. Python deps ---------------------------------------------------------
if [[ -f "$REPO_ROOT/requirements.txt" ]]; then
  log "Installing Python deps from requirements.txt"
  if ! "${PIP_ARGS[@]}" install --user -r "$REPO_ROOT/requirements.txt"; then
    err "pip install failed. Try: ${PIP_ARGS[*]} install --user --break-system-packages -r requirements.txt"
    exit 1
  fi
else
  warn "No requirements.txt found at $REPO_ROOT/requirements.txt — skipping Python install"
fi

# --- 3. Smoke test ----------------------------------------------------------
if [[ "$RUN_TESTS" -eq 1 ]]; then
  log "Running smoke test (npm test)"
  if (cd "$REPO_ROOT" && npm test --silent); then
    log "Tests passed."
  else
    err "Tests failed. See output above."
    exit 1
  fi
fi

# --- 4. MCP config snippet --------------------------------------------------
if [[ "$PRINT_CONFIG" -eq 1 ]]; then
  log "Generating MCP config for target: $TARGET"
  CONFIG_ARGS=("--target" "$TARGET")
  if [[ -n "$CUSTOM_PATH" ]]; then
    CONFIG_ARGS+=("--path" "$CUSTOM_PATH")
  fi
  echo
  echo "================================================================"
  echo " Paste this into your agent's MCP config:"
  echo "================================================================"
  (cd "$REPO_ROOT" && node scripts/setup-config.js "${CONFIG_ARGS[@]}")
  echo "================================================================"
fi

log "Done. Server entrypoint: $REPO_ROOT/src/server.js"
log "Run it with: node $REPO_ROOT/src/server.js  (or  bash scripts/mcp-wrapper.sh )"
