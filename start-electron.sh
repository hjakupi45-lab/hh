#!/bin/bash
# Electron by Haris - macOS Launcher

cd "$(dirname "$0")"

echo "=========================================="
echo "  Starting Electron by Haris on macOS...  "
echo "=========================================="

# Check for Node.js
if ! command -v node &> /dev/null; then
    # Check common Mac locations
    if [ -f "/opt/homebrew/bin/node" ]; then
        export PATH="/opt/homebrew/bin:$PATH"
    elif [ -f "/usr/local/bin/node" ]; then
        export PATH="/usr/local/bin:$PATH"
    else
        echo "[!] Node.js is not found on your system."
        echo "Please install Node.js from https://nodejs.org or via Homebrew: brew install node"
        exit 1
    fi
fi

# Ensure dependencies are installed
if [ ! -d "node_modules/electron" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Launching Electron by Haris..."
npm start
