# Tests and benchmarks

## Check a local change

Use Node.js 22.12 or later with Git and GNU patch on your path. On Windows, set `PATCH_EXE` to the full path of GNU patch if necessary. Git for Windows includes it under `usr/bin/patch.exe`.

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
```

The core tests cover comparison and merge ranges, whitespace and line endings, three-way conflict resolution, sessions, folder exports, and report escaping. The patch tests apply generated files using Git and GNU patch.

## Test the production app

```sh
npm run build
npx playwright install chromium firefox
npm run test:browser
```

The browser tests cover comparisons, editing, merging, folder selection, exports, session imports, and privacy. The Pages smoke test serves the compiled app under a project subpath and checks that text and folder comparisons can load their assets and workers with the policy from the HTML. CI also checks both Docker Compose deployments. [CI runs](https://github.com/Astro1247/CompareKit/actions/workflows/ci.yml) · [Deployment guide](deployment.md)

## Benchmarks

Example measurements on Windows with Node 25.3.0 and an Intel Core i9-11900K. Text times are the median of five diff-engine runs. The folder time measures SHA-256 processing of 6,000 synthetic files representing 3,000 paths. These measurements cover computation and exclude browser rendering, worker startup, and disk latency.

| Input | Size per text side | Measured time |
| --- | ---: | ---: |
| 40-line configuration snippet | 550 B | 0.1 ms |
| 10,000 lines | 159 kB | 7.6 ms |
| 100,000 lines | 1.69 MB | 88.4 ms |
| 100,000 longer lines | 4.09 MB | 81.9 ms |
| 3,000 folder paths | 3.30 MB across both folders | 124 ms |

Run `npm run benchmark` to reproduce the measurements.

## Screenshots

CompareKit and the locally built Text Diff View comparison used the same YAML fixture at [1280 × 720](screenshots/workspace-1280.png), [1920 × 1080](screenshots/workspace-1920.png), [2560 × 1440](screenshots/workspace-2560.png) and [3840 × 2160](screenshots/workspace-3840.png). The workspace, including pane controls, used at least 84% of the viewport at each tested size. The capture harness also ran Delta's text and folder modes with the same fixtures.

[Dark theme](screenshots/workspace-dark.png) and [folder view](screenshots/folders.png) are included. Run `npx tsx tests/capture.ts` for CompareKit screenshots or add `--references` after checking out and building the pinned references under `references/`. Upstream capture files go to `qa-artifacts/reference/`.

