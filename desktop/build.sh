#!/usr/bin/env bash
# Builds the Windows installer (dist/NeuSource-Statutory-CRM-Setup-x.y.z.exe).
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
  name: "neusource-statutory-crm", productName: "NeuSource Statutory CRM", version: root.version,
  description: "NeuSource Statutory CRM — company compliance documents on letterhead", author: "NeuSource Startup Minds India",
  main: "desktop/main.js", private: true, dependencies: root.dependencies,
  devDependencies: { electron: "43.8.0", "electron-builder": "26.15.3" },
  build: {
    appId: "com.neusource.statutorycrm", productName: "NeuSource Statutory CRM", asar: false, publish: null,
    directories: { output: process.argv[2] },
    files: ["server.js", "lib/**", "public/**", "desktop/**", "node_modules/**", "package.json"],
    win: { target: [{ target: "nsis", arch: ["x64"] }], icon: "desktop/icon.ico" },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: "always", createStartMenuShortcut: true,
      shortcutName: "NeuSource CRM", installerIcon: "desktop/icon.ico", uninstallerIcon: "desktop/icon.ico", deleteAppDataOnUninstall: false,
      artifactName: "NeuSource-Statutory-CRM-Setup-${version}.${ext}" }
  }
};
require("fs").writeFileSync(process.argv[3] + "/app/package.json", JSON.stringify(pkg, null, 2));
' "$ROOT" "$OUT" "$STAGE"
cd "$STAGE/app"
npm install --no-audit --no-fund --loglevel=error
npx electron-builder --win --x64 --publish never
echo "Installer written to $OUT"
