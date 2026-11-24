# CompareKit

CompareKit is an MIT-licensed, self-hosted workspace for comparing and merging text, files and directories. Paste into either Monaco editor or open local files to begin. Comparisons, hashes and merges run in the browser. The static host needs no database, accounts, API or outbound internet access after installation.

[Try the latest GitHub build](docs/github-publishing.md#try-a-build-from-github-actions) · [Live demo setup and publishing](docs/github-publishing.md)

![CompareKit split comparison with inline merge arrows](docs/screenshots/workspace-1280.png)

## Start with Docker Compose

With Docker Engine and the Compose plugin installed, run from the project checkout.

```sh
docker compose up --build -d
```

Open [CompareKit on localhost](http://localhost:8080). The standard deployment listens on all interfaces. Set `COMPAREKIT_BIND=127.0.0.1` to keep it on loopback, or `COMPAREKIT_PORT=8090` to change the port. You can put either variable in a local `.env` file. The Compose health check uses `/healthz`.

## Run standalone

Build from source with Node.js 22.12 or later and npm. Runtime serving requires only Node.js and the built files.

```sh
npm ci
npm run build
npm start
```

The standalone server listens at [127.0.0.1:8080](http://127.0.0.1:8080). Set `HOST` and `PORT` to change its listener. A release archive contains `dist/` and `scripts/serve.mjs`. Unpack it and run `node scripts/serve.mjs` without an install. You can also serve `dist/` with an existing static server. See [deployment and HTTPS](docs/deployment.md).

Opening `dist/index.html` directly as a file is unsupported. Modern browsers require an HTTP origin for the bundled ES modules and workers. A loopback server works with the internet disconnected.

## Use the workspace

- **Text** has two editable Monaco panes, split and unified views, keyboard navigation, bookmarks, search and replace, and live or manual comparison. Indentation-only and trailing whitespace edits have a subtle inline highlight and a separate count. Select either arrow in the center gutter to apply a change. The bookmark menu includes bulk merge and folding controls.
- **Folders** compares files by SHA-256. Pick both directories, optionally set scan filters, and select a changed text file to open it in the editor. **Stage modified** includes the edited result in folder patch and ZIP exports. Folder selections remain read-only.
- **Three-way** compares two edited files, A and B, against the file they both started from. Compatible changes go into a separate merge result. Use the buttons beside changed lines to resolve conflicts. All four panes keep corresponding lines in view while you scroll. Turn off **Sync scrolling** in the toolbar to scroll independently. **Compare two files** switches to the Text workspace, where you can merge changes directly into either input. [Three-way workspace](docs/screenshots/three-way.png)
- **Options** supports whitespace, case, blank-line, line-ending, Unicode, JSON equivalence and regex rules. Merges use source ranges. Patches and reports retain original differences even when a workspace ignores them.
- **Export** offers unified diffs, Git-compatible patches, standalone HTML reports, JSON sessions and compressed share links. Share links carry the original text in the URL fragment. Treat a share link as sensitive as the files it contains.
- **Sessions** holds open comparisons in memory. Enable explicit saves in **Settings → Privacy** to save selected sessions in the current browser. Theme and editor preferences have a separate storage setting.

![CompareKit folder comparison](docs/screenshots/folders.png)

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Compare, open files, export | Ctrl/⌘+Enter, Ctrl/⌘+O, Ctrl/⌘+S |
| Undo and redo | Ctrl/⌘+Z, Ctrl/⌘+Shift+Z or Ctrl+Y |
| Next and previous change | F7, Shift+F7 |
| Apply to original or modified | Alt+Left, Alt+Right |
| Bookmark and navigate bookmarks | Ctrl/⌘+B, Alt+Shift+Left/Right |
| Search both inputs | Ctrl/⌘+Shift+F |
| Swap, toggle unified view, toggle folding | Ctrl/⌘+Shift+X / U / H |
| Fullscreen | Alt+Shift+F |
| Copy diff or download a patch | Ctrl/⌘+Shift+C / P |
| Settings or shortcut search | Ctrl/⌘+Comma / Slash |

Current Chromium and Firefox are covered by browser tests. Chrome, Edge and Firefox support folder inputs. An additional Chromium directory picker on secure origins includes empty directories. Popovers and merge controls support keyboard navigation.

## Develop and verify

The interoperability tests use Git and GNU patch. Put both on PATH or set `PATCH_EXE` to the path of GNU patch. Git for Windows includes it under `usr/bin/patch.exe`.

```sh
npm ci
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox
npm run test:browser
npm run benchmark
npx tsx tests/capture.ts
```

- [Deployment and HTTPS](docs/deployment.md)
- [Architecture, session format and limits](docs/architecture.md)
- [Verification and benchmarks](docs/verification.md)
- [Upstream feature parity](FEATURE_PARITY.md)
- [Security and privacy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)

