# Contributing to FeatureBuilder

Thank you for helping improve FeatureBuilder. Bug reports, workflow feedback, documentation improvements, and focused pull requests are welcome.

## Development setup

FeatureBuilder requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run check
npm audit --audit-level=high
npm run package:dir
```

Keep changes focused, add tests for model or persistence behavior, and update documentation when behavior or the project format changes. Do not commit project specifications containing confidential design information, credentials, generated builds, or editor-specific files.

By submitting a contribution, you agree that it may be distributed under the MIT License.
