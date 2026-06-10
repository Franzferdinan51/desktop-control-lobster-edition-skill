#!/bin/sh
# Cross-platform MCP server wrapper
# Resolves the skill directory relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
exec node "$SKILL_DIR/src/server.js"
