#!/usr/bin/env bash
# scripts/check.sh
# Pre-flight health check for newest-desktop-control.
#
# Verifies the install is healthy without modifying anything:
#   1. Node.js >= 18
#   2. Python 3 + pip
#   3. Python deps from requirements.txt
#   4. ADB (optional, for Android)
#   5. The MCP server boots and reports its backends
#   6. The npm test suite passes
#
# Exit codes:
#   0   all checks pass
#   1   required check failed
#   2   optional check failed (ADB), but everything else is fine
#
# Usage:
#   bash scripts/check.sh                # run all checks
#   bash scripts/check.sh --no-tests     # skip the npm test run
#   bash scripts/check.sh --json         # emit a JSON summary (handy for CI)
#   bash scripts/check.sh --quiet        # only print failures

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RUN_TESTS=1
JSON_OUT=0
QUIET=0

usage() {
  cat <<'EOF'
check.sh — pre-flight health check for newest-desktop-control

Usage:
  bash scripts/check.sh [options]

Options:
  --no-tests   Skip the npm test suite run
  --json       Emit a single JSON document with all check results
  --quiet      Only print failures and the final summary
  --help, -h   Show this help

Exit codes:
  0   all required checks pass
  1   a required check failed
  2   a non-fatal check (ADB or tests) failed
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-tests) RUN_TESTS=0; shift ;;
    --json)     JSON_OUT=1; shift ;;
    --quiet)    QUIET=1; shift ;;
    --help|-h)  usage; exit 0 ;;
    *)          echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

PYTHON_BIN="python3"
[[ "$(uname -s 2>/dev/null || echo unknown)" == MINGW* || "$(uname -s 2>/dev/null || echo unknown)" == MSYS* ]] && PYTHON_BIN="python"

# Result tracking. We append "name|status|detail" rows.
RESULTS=()
REQUIRED_FAIL=0
OPTIONAL_FAIL=0

record() {
  local name="$1" status="$2" detail="$3" optional="${4:-false}"
  RESULTS+=("${name}|${status}|${detail}")
  if [[ "$status" != "ok" ]]; then
    if [[ "$optional" == "true" ]]; then
      OPTIONAL_FAIL=$((OPTIONAL_FAIL + 1))
    else
      REQUIRED_FAIL=$((REQUIRED_FAIL + 1))
    fi
  fi
  if [[ $QUIET -eq 0 && $JSON_OUT -eq 0 ]]; then
    case "$status" in
      ok)     printf '\033[1;32m  ✓\033[0m %-22s %s\n' "$name" "$detail" ;;
      warn)   printf '\033[1;33m  !\033[0m %-22s %s\n' "$name" "$detail" ;;
      fail)   printf '\033[1;31m  ✗\033[0m %-22s %s\n' "$name" "$detail" ;;
    esac
  fi
}

check_node() {
  if command -v node >/dev/null 2>&1; then
    local major; major="$(node -p 'process.versions.node.split(".")[0]')"
    if [[ "$major" -ge 18 ]]; then
      record "node" ok "v$major >= 18"
    else
      record "node" fail "v$major < 18 — please upgrade"
    fi
  else
    record "node" fail "node not found on PATH"
  fi
}

check_python() {
  if command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    local ver; ver="$("$PYTHON_BIN" -V 2>&1)"
    record "python" ok "$ver"
  else
    record "python" fail "$PYTHON_BIN not found on PATH"
    return
  fi
}

check_pip() {
  if command -v pip >/dev/null 2>&1 || command -v pip3 >/dev/null 2>&1; then
    record "pip" ok "found"
  elif "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    record "pip" ok "via $PYTHON_BIN -m pip"
  else
    record "pip" fail "no pip on PATH and '$PYTHON_BIN -m pip' missing"
  fi
}

check_python_deps() {
  # pip name → import name overrides. Some packages use a different module
  # name than their pip distribution (Pillow → PIL, pygetwindow → pygetwindow, etc.).
  # bash 3.2 ships with macOS, so we can't use declare -A; use a case statement.
  import_name() {
    case "$1" in
      Pillow) echo "PIL" ;;
      pytesseract|piteract) echo "pytesseract" ;;
      pyautogui) echo "pyautogui" ;;
      pygetwindow) echo "pygetwindow" ;;
      screeninfo) echo "screeninfo" ;;
      psutil) echo "psutil" ;;
      *) echo "$1" ;;
    esac
  }
  local missing=()
  while IFS= read -r pkg; do
    [[ -z "$pkg" || "$pkg" =~ ^# ]] && continue
    local mod; mod="$(import_name "$pkg")"
    if ! "$PYTHON_BIN" -c "import importlib; importlib.import_module('$mod')" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done < "$REPO_ROOT/requirements.txt"
  if [[ ${#missing[@]} -eq 0 ]]; then
    record "python-deps" ok "all $(wc -l < "$REPO_ROOT/requirements.txt" | tr -d ' ') packages importable"
  else
    record "python-deps" fail "missing: ${missing[*]} (run: bash scripts/install.sh)"
  fi
}

check_adb() {
  if command -v adb >/dev/null 2>&1; then
    # grep -c returns exit 1 when no matches; || true prevents set -e from killing the script.
    local devices; devices="$(adb devices 2>/dev/null | tail -n +2 | grep -c 'device$' || true)"
    if [[ "$devices" -gt 0 ]]; then
      record "adb" ok "$devices device(s) connected"
    else
      record "adb" warn "adb installed but no devices connected" true
    fi
  else
    record "adb" warn "adb not on PATH — Android tools will be unavailable" true
  fi
}

check_server_status() {
  if (cd "$REPO_ROOT" && node src/server.js --status >/tmp/ndc-status.json 2>/tmp/ndc-status.err); then
    if node -e "const r = require('/tmp/ndc-status.json'); if (!r.desktop || !r.android) process.exit(1)" >/dev/null 2>&1; then
      local count; count="$(node -e "console.log(Object.keys(require('/tmp/ndc-status.json')).filter(k => ['desktop','cua','android','codex'].includes(k) && require('/tmp/ndc-status.json')[k].available).length)")"
      record "server-status" ok "$count backend(s) available (desktop/cua/android/codex)"
    else
      record "server-status" warn "server boots but did not report all backends" true
    fi
  else
    record "server-status" fail "server failed to start — see /tmp/ndc-status.err"
  fi
}

check_tests() {
  if [[ $RUN_TESTS -eq 0 ]]; then
    record "tests" warn "skipped (--no-tests)" true
    return
  fi
  if (cd "$REPO_ROOT" && npm test --silent >/tmp/ndc-test.log 2>&1); then
    local pass; pass="$(grep -E '^# pass' /tmp/ndc-test.log | awk '{print $3}')"
    record "tests" ok "$pass tests pass"
  else
    record "tests" fail "npm test failed — see /tmp/ndc-test.log" true
  fi
}

emit_json() {
  node -e '
    const rows = process.argv.slice(1).map((r) => {
      const [name, status, detail] = r.split("|");
      return { name, status, detail };
    });
    const required = rows.filter((r) => r.status === "fail" && !(r.name === "adb" || r.name === "tests"));
    const optional = rows.filter((r) => r.status !== "ok");
    process.stdout.write(JSON.stringify({ ok: required.length === 0, required_failures: required, optional_failures: optional, all: rows }, null, 2) + "\n");
  ' "${RESULTS[@]}"
}

[[ $JSON_OUT -eq 0 ]] && printf '\033[1;36m[check]\033[0m Running health checks for newest-desktop-control\n'

check_node
check_python
check_pip
check_python_deps
check_adb
check_server_status
check_tests

if [[ $JSON_OUT -eq 1 ]]; then
  emit_json
else
  echo
  if [[ $REQUIRED_FAIL -eq 0 && $OPTIONAL_FAIL -eq 0 ]]; then
    printf '\033[1;32m[check]\033[0m All checks passed. ✨\n'
  elif [[ $REQUIRED_FAIL -eq 0 ]]; then
    printf '\033[1;33m[check]\033[0m Required checks passed. %d optional check(s) failed.\n' "$OPTIONAL_FAIL"
  else
    printf '\033[1;31m[check]\033[0m %d required check(s) failed.\n' "$REQUIRED_FAIL"
  fi
fi

if [[ $REQUIRED_FAIL -gt 0 ]]; then exit 1; fi
if [[ $OPTIONAL_FAIL -gt 0 ]]; then exit 2; fi
exit 0
