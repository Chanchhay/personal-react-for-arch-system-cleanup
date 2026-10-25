#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT=3801

# Check node
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed."
  exit 1
fi

# Ensure dependencies installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build frontend if dist doesn't exist
if [ ! -d "dist" ]; then
  echo "Building frontend..."
  npm run build
fi

echo "=========================================================="
echo "  Storage Hub — Arch Linux Disk Manager"
echo "  Dashboard running at: http://localhost:$PORT"
echo "=========================================================="

# Open browser in background after short delay
(
  sleep 1.2
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
  elif command -v zen-browser >/dev/null 2>&1; then
    zen-browser "http://localhost:$PORT" >/dev/null 2>&1 || true
  fi
) &

# Run server
PORT=$PORT node server.js
