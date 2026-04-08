# Contributing

Thanks for your interest in improving `s3-files-ai-sdk`.

## Development Setup

```bash
npm install
npm run ci
```

The main commands are:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run pack:check`
- `npm run ci`

## Project Expectations

- Keep the public API small and well-typed
- Preserve the per-agent isolation model
- Prefer changes that work in both direct and remote mode unless the feature is intentionally runtime-specific
- Keep model-facing tool output concise

## Documentation

If you change behavior that users will touch directly, update:

- `README.md`
- `docs/use-cases.md` when it affects deployment or workflow guidance
- examples in `examples/` when it affects integration code

## Tests

Before opening a pull request, run:

```bash
npm run ci
```

If you add new commands, configuration, or release behavior, add or update tests accordingly.

## Changesets and Releases

This repo uses Changesets for versioning and changelog generation.

For a user-facing change:

```bash
npm run changeset
```

Choose the appropriate bump level and describe the change in plain language. Maintainers will use the generated version PR and publish workflow for releases.

## Pull Requests

- Keep PRs focused
- Include tests or explain why a change does not need them
- Update docs when behavior changes
- Avoid committing generated `dist/` output or `node_modules/`
