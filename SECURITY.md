# Security and privacy

Report a suspected vulnerability through GitHub private vulnerability reporting when enabled. Include the affected version, browser, self-host configuration and steps that reproduce the issue with harmless inputs. Keep credentials and production comparison data out of issue trackers.

## Data handling

All comparison, parsing, rendering, merge and export operations happen in the browser. Input directories are read-only. The app keeps comparison content in memory by default. Browser storage holds preferences and usage-metrics choices where applicable. Saved comparisons require enabling session saves and choosing to save a session. The standard Docker and standalone builds send no telemetry.

**Clear workspace** drops active documents, open comparisons, undo history and folder scans. Explicitly saved sessions have a separate deletion action in **Settings → Privacy**. A browser cannot guarantee memory erasure. Previously downloaded files, clipboard history, browser sync, extensions and a compromised browser or serving origin remain outside the application's control.

A share URL includes its payload after the fragment marker. Browsers generally exclude fragments from HTTP requests, but local history, synchronization, extensions and sharing applications can retain them. The encoding is reversible. After import, use **Remove data from URL** to replace the current history entry. Other copies of the URL can still exist.

## Hosted usage metrics

When a static deployment is configured with Umami, usage metrics start enabled. Select **Turn off metrics** in the notice or change **Settings → Privacy → Send usage metrics to Umami** at any time. The choice applies to the current browser and collector. CompareKit also honors the browser's Global Privacy Control signal.

Requests use a fixed page path and a list of action names for visits, samples, modes, merge buttons, sessions, options, and exports. The sender adds the deployment hostname and the public Umami website ID. It excludes comparison inputs and outputs, names and paths of local files, clipboard contents, search and filter values, error messages, URL queries and fragments, cookies, and referrers. Umami processes the IP address and browser user agent when estimating visitor counts. [Umami metric definitions](https://docs.umami.is/docs/metric-definitions#visitor-identification)

## Defensive controls

The deployment uses a self-only script and worker CSP and restricts frames, objects, form submission, and base URLs. Default builds use `connect-src 'none'`. A static build with usage metrics allows connections to its configured HTTPS collection URL and uses a sender bundled with CompareKit. Monaco injects editor styles at runtime, so `style-src` permits inline styles. Text is rendered through Monaco or React. HTML and Markdown preview uses an inert parse tree with allowlisted and attribute-free elements. A preview strips links, scriptable or foreign-namespace elements, and remote resource URLs. HTML report generation escapes untrusted content and adds a local-only policy.

Folder scans run with bounded concurrency and read file bytes in fixed-size chunks. Regex matching runs inside a worker with a deadline. Session payloads are validated and decompressed with a cap. Patch application uses an exact-hunk preview. Patch and ZIP paths are validated, and archives never extract inside CompareKit.

CSP is one browser-side control. Keep the host, container base and browser updated, and use a trusted HTTPS origin for network deployment.

