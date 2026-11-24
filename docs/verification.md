# Verification

## Automated and deployment checks

- Formatting, lint, strict TypeScript and the production build passed locally.
- All 18 core tests passed. Coverage includes whitespace comparison ranges, two-way merging, mixed newlines and BOM handling, JSON precision, three-way conflict boundaries, scroll alignment, history, session validation, folder exports and escaped reports. Git and GNU patch applied generated patches.
- Chromium and Firefox each ran fourteen browser scenarios against the built app. Coverage includes mixed indentation and content edits, navigation to whitespace-only changes in folded text, synchronized scrolling, inline three-way conflict resolution, bidirectional merging, directory and export flows, share import, a 10,000-line file and non-secure HTTP folder selection.
- Browser checks blocked external requests, exercised untrusted content and the document preview, and inspected browser storage. No external requests were observed and default comparison content was absent from persistent storage.
- Standard and isolated Compose both returned HTTP 200. The hardened app used a read-only root, dropped all capabilities and had no published port or default route. An outbound connection from that container failed with Network unreachable.
- The Linux amd64 image ran through Compose. The Linux arm64 image built locally and reported the expected architecture.
- npm reported zero known advisories for the resolved dependencies at the time of verification.
- The extracted 3.76 MB standalone ZIP served the app and health endpoint without installing packages.

## GitHub publishing checks

- The Pages test served the production build at a repository subpath and ran text and folder comparisons with the browser policy from HTML. Chromium and Firefox loaded the required assets and workers from that subpath.
- The CI, Pages, and release workflows passed actionlint and ShellCheck. Biome passed with non-blocking style advisories.
- The standalone tarball and checksum used by the release workflow were built locally. The extracted tarball contained the bundled notices and served the app and health endpoint without installing packages.
- The initial Pages deployment and GHCR release can be verified after connecting a public GitHub repository. [Publishing instructions](github-publishing.md)

## Benchmarks

Local measurements on Windows with Node 25.3.0 and an Intel Core i9-11900K. Text times are the median of five diff-engine runs. The folder time measures SHA-256 processing of 6,000 synthetic files representing 3,000 paths. These measurements cover computation and exclude browser rendering, worker startup and disk latency.

| Input | Size per text side | Measured time |
| --- | ---: | ---: |
| 40-line configuration snippet | 550 B | 0.1 ms |
| 10,000 lines | 159 kB | 7.6 ms |
| 100,000 lines | 1.69 MB | 88.4 ms |
| 100,000 longer lines | 4.09 MB | 81.9 ms |
| 3,000 folder paths | 3.30 MB across both folders | 124 ms |

Run `npm run benchmark` to reproduce the measurements.

## Visual and upstream checks

CompareKit and the locally built Text Diff View comparison used the same YAML fixture at [1280 × 720](screenshots/workspace-1280.png), [1920 × 1080](screenshots/workspace-1920.png), [2560 × 1440](screenshots/workspace-2560.png) and [3840 × 2160](screenshots/workspace-3840.png). The workspace, including pane controls, used at least 84% of the viewport at each tested size. The capture harness also ran Delta's text and folder modes with the same fixtures.

[Dark theme](screenshots/workspace-dark.png) and [folder view](screenshots/folders.png) are included. Run `npx tsx tests/capture.ts` for CompareKit screenshots or add `--references` after checking out and building the pinned references under `references/`. Upstream capture files go to `qa-artifacts/reference/`.

