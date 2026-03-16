#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
ZIP_NAME="spotify-ai-blocker-chrome-extension-v${VERSION}.zip"

echo "Building dist/ for version ${VERSION}..."
pnpm build

echo "Removing previous zip (if any)..."
rm -f "${ZIP_NAME}"

echo "Removing .DS_Store files from dist/..."
find dist -name '.DS_Store' -delete || true

echo "Creating release archive ${ZIP_NAME} from contents of dist/ (no top-level folder)..."
(
  cd dist
  zip -qr "../${ZIP_NAME}" . -x '*.DS_Store'
)

echo "Release archive created at: ${ZIP_NAME}"

