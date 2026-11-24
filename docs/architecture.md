# Architecture

The React workspace holds the source documents and history in memory. Monaco receives the text for editing and uses its own worker to align panes and paint character changes. Imports, merges, undo and redo update the authoritative source documents. Monaco edit events translate visible LF offsets back to original document offsets, preserving untouched newline sequences and the UTF-8 BOM. Source operations use an independent line diff so application logic can run in Web Workers and use the same ranges for statistics, navigation and merges.

| Area | Implementation |
| --- | --- |
| Editable panes and themes | `src/editor/` and `src/styles.css` |
| Text diff, line normalization and directional merges | `src/core/text.ts`, `src/core/compare.worker.ts` |
| Three-way merge | `src/core/three-way.ts` and `src/ui/three-way.tsx` |
| Directory selection, SHA-256 and ZIP | `src/core/folders.ts`, `src/core/folder.worker.ts`, `src/ui/folders.tsx` |
| Patch and HTML generation | `src/core/export.ts`, `src/core/transfer.worker.ts` |
| Session and share encoding | `src/core/session.ts` |
| Undo and redo | `src/core/history.ts` |
| Safe document preview | `src/ui/preview.tsx` |
| Static deployment | `scripts/serve.mjs`, `docker/`, `compose*.yaml` |

## Comparison semantics

The exact input and comparison options are sent to a cancellable worker after a short debounce. Ignore rules compare normalized keys with indexes back to current source lines. Matching blank or regex-filtered lines stay in the source. Adjacent actionable ranges are split across ignored lines to protect unrelated content during merge. When both JSON documents parse, their formatted representations can be checked for equivalence, with optional key sorting. In the Text workspace, Monaco and the worker align matching content across leading or trailing spaces and tabs. The worker tracks those whitespace changes separately for highlighting, navigation and merging. Original differences may remain visible alongside other active ignore rules. **Mark ignored differences** identifies excluded regions. Patches and reports use original source text.

A change is a contiguous run of insertions, deletions, replacements or edge-whitespace edits. A replacement contributes to both line counts. Edge-whitespace edits count separately in the Text workspace and leave content similarity unchanged. Three-way merging can split overlapping replacements with a one-to-one line mapping so a conflict choice keeps the neighboring edits. Unequal replacements stay grouped where their original lines cannot be paired. Similarity is 100 × (1 − (added + removed) / (left lines + right lines)), rounded to the nearest integer. Empty pairs are 100 percent similar. Line-ending preferences are maintained for new edits where possible. Imported UTF-16 with an explicit BOM is decoded as text, and text downloads use UTF-8.

Monaco's split view exposes both editable panes. In unified mode the modified pane is directly editable and the original is a comparison reference. Switch back to Split to edit the original in place. The native visual layout may group changed lines differently from exported Git patch hunks.

Three-way scroll synchronization uses the merge ranges to line up corresponding text across insertions and deletions. Direct edits to the merge result are aligned by a local worker comparison with the generated result.

## Session format v1

A UTF-8 JSON object contains `version: 1`, `title`, `mode` (`text` or `three`), `left`, `right` and `base` documents (each with `name` and `text`), `options`, and an array of zero-based source-line `bookmarks`. An optional `merge` object holds conflict `choices` keyed by generated conflict ID and an optional edited `result`. The importer validates both shape and limits and ignores unknown properties. A share link contains the same JSON compressed with gzip and encoded with base64url after `#ck1=`.

The session format contains no folder handles, staged folder edits, file hashes or undo history. To preserve staged folder outputs, save the folder patch or ZIP. Saved sessions require explicit opt-in and an explicit save action. Open memory-only sessions live until the tab is closed or the workspace is cleared.

## Limits

| Area | Limit or behavior |
| --- | --- |
| Text input | 8 MiB per imported file, 8 million code units or 200,000 lines per pane |
| Folder scan | 25,000 unique paths and 8 GiB of files per scan. Four hashing tasks on a local worker |
| Folder ZIP and patch | 64 MiB input budget per export. ZIP carries changed or staged files, with removals represented in text patches |
| Session file and decompressed share data | 28 MiB |
| Share URL | 24,000 encoded characters. JSON export is the fallback |
| Undo | 80 checkpoints or about 32 MiB of held text, with at least one checkpoint retained |
| Document preview | 256 KiB of source, 10,000 parsed nodes and bounded nesting |
| Images | Local raster previews up to 20 MiB and 12 megapixels per file |
| Patch import | One file at a time with exact hunk matching and explicit preview |
| Folder writes | Download-based workflow. Picked input files remain read-only |

The app applies deadlines to expensive text comparison, normalization and report work. A timeout leaves the sources available for editing and export. Limitations and upstream-specific differences are tracked in the [feature parity audit](../FEATURE_PARITY.md).

