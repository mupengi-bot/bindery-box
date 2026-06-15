# BINDERY BOX Desktop Shell

Thin Electron shell for the desktop-first local workbench.

The shell deliberately stays small:

- loads the local BINDERY Workbench URL (`BINDERY_DESKTOP_URL`, default `http://127.0.0.1:3000`)
- exposes one safe native bridge: `binderyDesktop.pickWorkspaceFolder()`
- keeps Node integration disabled and context isolation enabled
- opens external links in the system browser

Run after the native server is up:

```bash
npm run bindery:native-start
cd apps/desktop
npm install
npm run start
```

Package unsigned local alpha builds:

```bash
cd apps/desktop
npm run package:mac
cd ../..
npm run check:desktop-package
```

Artifacts are written to:

```txt
apps/desktop/dist/mac-arm64/BINDERY BOX Desktop.app
apps/desktop/dist/BINDERY BOX Desktop-0.1.0-alpha.0-arm64.dmg
```

The repo-level `npm run bindery:desktop` command opens the current native/LAN workbench without requiring Electron to be installed; it is the fallback launcher until packaged installers are added.
