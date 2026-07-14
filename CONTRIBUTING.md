# Contributing to Causet Templates

Thank you for helping improve the official [Causet](https://github.com/Causet-Inc/Causet) template catalog.

## Ways to contribute

- Fix typos or clarify README walkthroughs
- Add or improve demos and quickstarts (Product DSL under `causet/`)
- Update `registry.json` when adding a template
- Report bugs or gaps via [GitHub Issues](https://github.com/Causet-Inc/causet-templates/issues)

## Development setup

```bash
git clone https://github.com/Causet-Inc/causet-templates.git
cd causet-templates

# Point the CLI at your clone
export CAUSET_TEMPLATES_DIR="$PWD"
causet templates list

# Or refresh from a local file URL
export CAUSET_TEMPLATES_REPO="file://$PWD"
causet templates update
```

Install [Causet CLI](https://github.com/Causet-Inc/Causet/tree/main/apps/causet-cli) and a local stack (`causet local up`) to exercise demos end-to-end.

### Demos with npm / SDK bundles

Browser demos depend on `@causet/sdk` from npm. After changing SDK usage:

```bash
cd demos
npm install && npm run build:all
```

Individual HTML demos also ship their own `package.json` and `npm run build:sdk`.

## Adding a template

1. Create `demos/my-demo/` or `quickstarts/my-demo/` with:
   - `template.json` — metadata (`id`, `causetFiles`, `commands`, etc.)
   - `README.md` — setup and walkthrough
   - `causet/` — Product DSL (required)
   - `gitignore` — scaffolded as `.gitignore` (no leading dot; see CLI embed rules)
2. Add a matching entry to `registry.json` (`path` must equal the folder path).
3. Run validation: `node scripts/validate.mjs`
4. Open a pull request against `main`.

Quickstarts should contain **Product DSL only** (`causet/` + docs). Demos may include `app/`, `demo.html`, and sample intents.

## Pull requests

- Keep changes focused; one template or concern per PR when possible.
- Update README/catalog tables if behavior or layout changes.
- Do not commit secrets, API keys, or personal paths.
- Ensure `registry.json` paths exist and `template.json` files parse as JSON.
- **Dependabot PRs:** merge if CI passes; run `npm run build:sdk` (or `npm run build:all` under `demos/`) when `@causet/sdk` or `esbuild` updates affect browser bundles.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
