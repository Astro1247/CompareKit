# Third-party notices

CompareKit’s original code is MIT-licensed. Applicable upstream notices stay with the adapted code. The upstream logos and branding are absent from the CompareKit build.

| Project | Reference revision | Use |
| --- | --- | --- |
| [Text Diff View](https://github.com/kaishuu0123/text-diff-view/tree/1d4e97112bfd9f849b3e7e2ff84e3bbf6d0188b6) | `1d4e97112bfd9f849b3e7e2ff84e3bbf6d0188b6` | React and Monaco renderer foundation, adapted worker initialization and appearance tokens in `src/editor/monaco.ts` and `src/styles.css`. [MIT notice](licenses/text-diff-view.txt). |
| [Delta](https://github.com/RadMageIRL/delta/tree/1f2ab4994502390aac91a2306cba73a8bb0b37a2) | `1f2ab4994502390aac91a2306cba73a8bb0b37a2` | Reference for comparison, folder, three-way and export workflows. Its DOM-bound implementation and bundled Prism assets are not shipped. [MIT notice](licenses/delta.txt). |

Distributed builds include the package license files and Monaco’s third-party notices in `licenses/`. Monaco, React, React DOM, Scheduler, fflate, ignore, @noble/hashes, marked, parse5, Vite and Rolldown publish under MIT. jsdiff uses BSD-3-Clause, entities uses BSD-2-Clause, and YAML uses ISC. The [Codicons](https://github.com/microsoft/vscode-codicons) font by Microsoft ships through Monaco under [CC BY 4.0](licenses/codicons-CC-BY-4.0.txt). Runtime assets are served from the same origin.

