#!/usr/bin/env bash
set -euo pipefail

REPO="ryha0008-boop/helo-win"
BINARY="helo"
DEST="/usr/local/bin/helo"

echo "helo — fetching latest release..."

# Get latest release tag
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "${TAG:-}" ]; then
    echo "ERROR: could not determine latest release"
    echo "Visit https://github.com/${REPO}/releases/latest"
    exit 1
fi

echo "  latest: ${TAG}"

# Find the linux asset
ASSET_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" \
    | grep '"browser_download_url".*linux' \
    | head -1 \
    | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "${ASSET_URL:-}" ]; then
    echo "ERROR: no linux binary found in release ${TAG}"
    exit 1
fi

TMP=$(mktemp)
echo "  downloading..."
curl -fsSL -o "${TMP}" "${ASSET_URL}"
chmod +x "${TMP}"

echo "  installing to ${DEST}..."
sudo cp "${TMP}" "${DEST}"
rm -f "${TMP}"

echo "  done! $(${DEST} --version)"
