# Publish CompareKit on GitHub

## Repository details

| Field | Suggested value |
| --- | --- |
| Name | `comparekit` |
| Description | Privacy-first diff and merge for text, files, and folders. Runs in your browser and can be self-hosted with Docker. |
| Website | The URL shown after a successful Pages deployment |
| License | MIT |
| Topics | `diff`, `text-diff`, `merge`, `file-comparison`, `folder-comparison`, `three-way-merge`, `local-first`, `privacy`, `self-hosted`, `monaco-editor`, `docker`, `developer-tools`, `typescript`, `react` |

Set the description, website, and topics using the gear next to **About** on the repository page. [GitHub guide to repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

## Publish the repository

1. Create an empty public repository named `comparekit` under your GitHub account or organization. Leave GitHub's README, license, and ignore-file setup unchecked because the checkout already contains them.
2. From this checkout, add GitHub as a separate remote and push the audited `main` branch. Replace `YOUR-ACCOUNT` with the owner you selected.

   ```sh
   git status --short
   git remote add github https://github.com/YOUR-ACCOUNT/comparekit.git
   git push github main
   ```

3. Confirm GitHub recognized the MIT license and the **CI** workflow passed. Enable private vulnerability reporting in the repository's security settings so the reporting path in [SECURITY.md](../SECURITY.md) is available. [GitHub guide to private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)

## Try a build from GitHub Actions

Open the latest successful **CI** run for `main` and download **comparekit-standalone** under **Artifacts**. Unzip it, run `node scripts/serve.mjs` from the extracted folder, and open `http://127.0.0.1:8080`. Select **Try sample** to compare the bundled examples. The artifact contains the compiled app and standalone server and needs no npm install.

## Enable the demo on GitHub Pages

1. Confirm the repository is public or that your GitHub plan supports Pages on private repositories. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. [GitHub Pages plan availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
2. Go to **Actions → Deploy demo to GitHub Pages → Run workflow**. Select `main` and run it. Pushes before setup skip the deployment and show a setup notice.
3. Open the URL shown by the deployment job, usually `https://YOUR-ACCOUNT.github.io/comparekit/`. Select **Try sample** to check the live demo. Use the deployment job's actual URL for the **About** website field and a **Try the demo** link near the top of the README.

The workflow rebuilds on pushes to `main`, verifies the compiled app at a repository subpath, and uploads only `dist/`. It deploys through the `github-pages` environment. Keep that environment restricted to `main`. [GitHub guide to Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

CompareKit's workers process inputs in the visitor's browser. The hosted demo ships the browser policy in its HTML. GitHub Pages controls the HTTP response headers, so use Docker or the standalone server when you need the self-hosted security headers or control of the serving origin. The public demo is a good place to try the bundled sample data. [GitHub Pages header support](https://github.com/orgs/community/discussions/32112)

## Publish a versioned release

After CI passes, create a tag matching the version in `package.json` and push that tag to GitHub. The current version is `0.1.5`. Use `github` instead of `origin` if you added GitHub as a separate remote above.

```sh
git tag -a v0.1.5 -m "CompareKit v0.1.5"
git push origin v0.1.5
```

Run **Actions → Release → Run workflow** from `main` with `v0.1.5` as the tag input. The workflow publishes the standalone archive and checksum to GitHub Releases and a versioned `linux/amd64` and `linux/arm64` image to GHCR. Set the GHCR package visibility to **Public** if you want visitors to pull the image anonymously. [GitHub guide to container package visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#pushing-container-images)
