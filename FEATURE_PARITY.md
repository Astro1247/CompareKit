# Upstream feature parity

The review used Text Diff View at `1d4e97112bfd9f849b3e7e2ff84e3bbf6d0188b6` and Delta at `1f2ab4994502390aac91a2306cba73a8bb0b37a2`. Both repositories are listed with their complete notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Text Diff View supplies the React, Monaco and theme baseline. Its Electron-specific renderer shell, updater and package lifecycle are tied to desktop releases. Delta connects its algorithms directly to its UI and localStorage. CompareKit implements the corresponding operations through worker-safe TypeScript, Monaco and browser file adapters. The local reference capture uses identical text fixtures and also runs Delta and CompareKit against the same directory fixtures.

| Upstream | Discovered feature | Direct reuse | CompareKit status and coverage |
| --- | --- | --- | --- |
| Text Diff View | Full-height Monaco diff, editable original and modified documents, context menus, selections, find and replace | Monaco setup and options adapted | Split workspace, Playwright edit and viewport tests |
| Text Diff View | VS Light and VS Dark, shell colors, remembered theme | Theme tokens adapted | System, light and dark, independently remembered preferences. Playwright theme test |
| Text Diff View | Whitespace marks, resize splitter and line highlighting | Monaco public APIs | Editor settings and draggable splitter, visual captures |
| Text Diff View | Previous and next change and unified diff dialog | Editor integration adapted | F7, buttons, editable unified workspace and read-only raw patch modal. Playwright navigation and Git patch tests |
| Text Diff View | Configurable unified diff labels and context, copy output | Lower-level generator replaced with jsdiff | Export path, context, clipboard and download. Unit and browser export tests |
| Text Diff View | Electron title bar, window management, native menus, About and update UI, Windows/macOS/Linux packaging | Electron-only | Fullscreen and focus mode in the browser. Electron shell and update checks are omitted for the static target |
| Text Diff View | Web build and Docker image | Web architecture adapted | Standalone static build, local server, standard and isolated Compose |
| Delta | Split and unified diffs, line/word/character highlighting, change and line counts | Monaco replaces custom renderer | Native aligned Monaco diff and counts. Merge, character, viewport and navigation tests |
| Delta | Ignore case, whitespace, regex chips, only changes, configurable context, expand all | DOM-bound implementation replaced | Independent rules, normalization worker, folding and expand all. Normalization tests |
| Delta | Pretty-print both JSON documents before comparing | DOM-bound implementation replaced | Equivalent formatting and key order are ignored for valid JSON. Substantive changes still map to original lines. Per-pane JSON formatting is explicit |
| Delta | Live and manual comparison, syntax highlighting, whitespace marks and text size | Monaco and its language bundles | Settings and contextual toolbar. Editor and theme tests |
| Delta | HTML and Markdown preview | Reimplemented with inert parsing | Actual document previews with active content, styles and resource URLs removed. Browser security test |
| Delta | Pane open, paste, rename, drag and drop one or two files, line ending warning, search controls | Reimplemented for Monaco | File import, native editing and search, status-bar line-ending indicator. Browser file import and unit EOL tests |
| Delta | Bidirectional block arrows with undo, swap, clear | Reimplemented against source ranges | Per-block and bulk operations. Browser and unit merge tests |
| Delta | Change bookmarks, keyboard navigation, help | Reimplemented for Monaco | Bookmarks, F7 and searchable keyboard help. State serialization and navigation tests |
| Delta | Base workspace, automatic merge, conflict navigation, Accept A/B/Base/Both, editable output and send to panes | Reimplemented using line ranges | Three-way workspace with merge result, conflict choices and manual resolution. Unit and browser conflict tests |
| Delta | Local directory selection, swap, filtering, SHA-256, directory summary | Reimplemented with browser File APIs and a worker | Compare, filter, swap, copy report and export. Browser folder and hashing tests |
| Delta | Expand folder details, open changed text, image pixel diff | Reimplemented with Monaco and canvas | Open changed text in the shared editor, staged folder edits, raster split/overlay/pixel modes. Folder workflow test |
| Delta | Save/update, duplicate, rename, close and restore named comparisons, global undo | Reimplemented for memory-first defaults | In-memory sessions plus explicit persistent saves. Automatic content persistence is disabled. Session, undo and privacy tests |
| Delta | Copy diff, download patch, launch/download standalone HTML, JSON export/import, share links | Reimplemented with local generators | Raw diff view, downloads, patch preview, JSON and fragment import. Unit and browser export/security tests. HTML reports are delivered as downloads |
| Delta | System, light, dark, Vegas neon and responsive mobile layout | Monaco shell styles from Text Diff View | Standard themes and responsive toolbar. The Vegas theme is omitted to keep the reference visual baseline |
| Delta | Ctrl+Enter, Ctrl+S, Ctrl+Z/Y, bracket changes and bookmarks, Alt+arrows, help shortcut | Reimplemented with editor-aware handlers | IDE-style bindings documented in README and searchable help. Single-key shortcuts are omitted to avoid collisions with editing |
| Delta | Standalone files opened directly from disk | Static modules require HTTP | Standalone loopback HTTP, no runtime package install for a released build |

