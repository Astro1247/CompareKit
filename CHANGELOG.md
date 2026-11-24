# Changelog

## 0.1.5

- Updated the diff engine, React, and development tooling.
- Moved CI and Docker builds to Node.js 26 LTS and updated the NGINX runtime and proxy to 1.30.8.
- Added a downloadable standalone build to successful GitHub CI runs on the default branch.

## 0.1.4

- Highlighted changed indentation and trailing whitespace in the Text workspace without coloring matching lines as additions or removals.
- Kept whitespace changes actionable and counted them separately from added and removed lines.

## 0.1.3

- Synchronized vertical scrolling across the three-way merge panes by default, with a toolbar toggle to scroll panes independently.

## 0.1.2

- Clarified the Base, Version A and Version B labels and added a direct link to the two-file comparison workspace.

## 0.1.1

- Highlighted three-way changes in the source and result panes, with inline apply buttons and synchronized change navigation.
- Narrowed conflicts inside aligned replacements so a decision preserves independent changes to adjacent lines.
- Preserved input documents and directly edited results when importing older sessions. Conflict choices from the earlier layout require review.

## 0.1.0

- Editable two-way Monaco workspace with live comparison, change navigation, directional merging, bookmarks and undo.
- Browser-local directory scans with SHA-256, text staging, raster comparison, patches and ZIP export.
- Three-way conflict resolution, editable result and merge export.
- Unified diff, patch preview, HTML report, JSON sessions and compressed share links.
- Static deployment, standalone server, standard and isolated Docker Compose, and GitHub release automation.

