# Contributing

Use a supported Node.js release and install with `npm ci`. Run `npm run dev` for development and `npm run build && npm start` to check the production policy and package. Keep fixtures synthetic and small.

Before submitting a change, run `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test`. Use `npm run test:browser` for changes to inputs, editors, navigation, downloads, settings or privacy. Run the corresponding Compose deployment when changing container configuration.

Preserve browser-local data handling. New dependencies need a clear use case, a pinned version and any applicable bundled notices. Document material changes to comparison semantics and add coverage for merge ranges or normalization rules that could change source content.

By contributing, you agree to publish your contributions under the project's [MIT license](LICENSE). Upstream provenance stays with adapted code.

