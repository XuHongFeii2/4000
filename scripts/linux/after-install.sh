#!/bin/bash

# Post-installation script for openclaw中文版 on Linux

set -e

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database -q /usr/share/applications || true
fi

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi

APP_DIRS=(
    "/opt/openclaw中文版"
    "/opt/openclaw-chinese"
    "/opt/ClawX"
)

APP_BINARIES=(
    "openclaw-chinese"
    "clawx"
)

# Create symbolic link for the packaged app binary
for APP_DIR in "${APP_DIRS[@]}"; do
    for APP_BINARY in "${APP_BINARIES[@]}"; do
        if [ -x "${APP_DIR}/${APP_BINARY}" ]; then
            ln -sf "${APP_DIR}/${APP_BINARY}" /usr/local/bin/openclaw-chinese 2>/dev/null || true
            break 2
        fi
    done
done

# Create symbolic link for openclaw CLI
for APP_DIR in "${APP_DIRS[@]}"; do
    OPENCLAW_WRAPPER="${APP_DIR}/resources/cli/openclaw"
    if [ -f "$OPENCLAW_WRAPPER" ]; then
        chmod +x "$OPENCLAW_WRAPPER" 2>/dev/null || true
        ln -sf "$OPENCLAW_WRAPPER" /usr/local/bin/openclaw 2>/dev/null || true
        break
    fi
done

echo "openclaw中文版 has been installed successfully."
