#!/usr/bin/env bash
# Builds the Windows installer (dist/ROC-Docs-Prepare-Setup-x.y.z.exe).
# Usage: bash desktop/build.sh [output-dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist}"
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/app"
cp -r "$ROOT/server.js" "$ROOT/lib" "$ROOT/public" "$ROOT/desktop" "$STAGE/app/"
rm -f "$STAGE/app/desktop/build.sh"
node -e '
const root = require(process.argv[1] + "/package.json");
const pkg = {
  name: "roc-docs-prepare", productName: "ROC Docs Prepare", version: root.version,
  description: "ROC Docs Prepare — company compliance documents on letterhead", author: "ROC Docs Prepare",
  main: "desktop/main.js", private: true, dependencies: root.dependencies,
  devDependencies: { electron: "43.8.0", "electron-builder": "26.15.3", resedit: "2.0.3" },
  build: {
    appId: "com.rocdocsprepare.app", productName: "ROC Docs Prepare", asar: false, publish: null,
    directories: { output: process.argv[2] },
    files: ["server.js", "lib/**", "public/**", "desktop/**", "node_modules/**", "package.json"],
    win: { target: [{ target: "dir", arch: ["x64"] }], icon: "desktop/icon.ico", signAndEditExecutable: false },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: "always", createStartMenuShortcut: true,
      shortcutName: "ROC Docs Prepare", installerIcon: "desktop/icon.ico", uninstallerIcon: "desktop/icon.ico", deleteAppDataOnUninstall: false,
      artifactName: "ROC-Docs-Prepare-Setup-${version}.${ext}" }
  }
};
require("fs").writeFileSync(process.argv[3] + "/app/package.json", JSON.stringify(pkg, null, 2));
' "$ROOT" "$OUT" "$STAGE"
cd "$STAGE/app"
npm install --no-audit --no-fund --loglevel=error
# Build the app folder with electron-builder, then the installer with native makensis (no Wine needed)
npx electron-builder --win dir --x64 --publish never
VERSION="$(node -p 'require("./package.json").version')"
node desktop/set-exe-info.js "$OUT/win-unpacked/ROC Docs Prepare.exe" desktop/icon.ico "$VERSION"
NSISROOT="$(dirname "$(dirname "$(find "$HOME/.cache/electron-builder" -path '*linux/makensis' -type f | head -1)")")"
if [ -z "$NSISROOT" ]; then echo "makensis not found in the electron-builder cache"; exit 1; fi
NSISDIR="$NSISROOT" "$NSISROOT/linux/makensis" -V2 -DVERSION="$VERSION" -DSRC="$OUT/win-unpacked" -DICON="$STAGE/app/desktop/icon.ico" \
  -DOUT="$OUT/ROC-Docs-Prepare-Setup-$VERSION.exe" "$STAGE/app/desktop/nsis/installer.nsi"
echo "Installer written to $OUT/ROC-Docs-Prepare-Setup-$VERSION.exe"
