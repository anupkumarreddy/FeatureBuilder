# FeatureBuilder

FeatureBuilder is a local-first desktop workspace for creating structured feature specifications that connect design intent with design-verification planning. It is aimed at hardware and RTL teams that need more traceability than a document editor provides without moving their specifications into a hosted service.

The project is in an early public release. The specification workflow is implemented; project-execution tracking is intentionally reserved for later development.

## What it does

- Organizes features in a searchable, drag-and-drop hierarchy.
- Captures overview, ownership, priority, tags, and open questions.
- Stores atomic requirements with stable identifiers and approval states.
- Separates architecture, interfaces, expected behavior, reset/error behavior, and performance constraints.
- Defines DV strategy, assertions, coverage, exclusions, and verification scenarios.
- Links verification scenarios to requirements and generates a traceability matrix.
- Reports completeness and uncovered requirements before review.
- Saves projects as readable, Git-friendly files rather than a proprietary database.

## Project format

A desktop project is an ordinary directory:

```text
my-chip-spec/
├── project.json
└── features/
    ├── feature-id-1.json
    └── feature-id-2.json
```

`project.json` holds project metadata and feature ordering. Each feature is stored separately to keep code reviews useful and reduce merge conflicts. FeatureBuilder validates identifiers before using them as filenames and writes files atomically.

Project folders may contain confidential hardware information. Review their contents before committing or sharing them.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- macOS, Windows, or Linux supported by Electron

## Run from source

```bash
git clone https://github.com/anupkumarreddy/FeatureBuilder.git
cd FeatureBuilder
npm ci
npm run dev
```

Keep the terminal process running while the desktop window is open. Press `Ctrl+C` to stop it.

To run the production build:

```bash
npm run build
npm start
```

## Quality and packaging

Run the complete local quality gate:

```bash
npm run check
npm audit --audit-level=high
```

Create an unpacked application for the current platform:

```bash
npm run package:dir
```

Create distributable artifacts for the current platform:

```bash
npm run package
```

Unsigned builds may trigger operating-system warnings. Official code signing and release automation are not yet configured.

## Architecture

- `src/` contains the React/TypeScript renderer, feature model, validation, and tests.
- `electron/preload.cjs` exposes the narrow desktop API through Electron context isolation.
- `electron/main.cjs` owns native windows and file dialogs.
- `electron/project-store.cjs` validates and atomically reads/writes project folders.

The Electron renderer has no Node.js access, runs in a sandbox with context isolation, uses a restrictive content-security policy, denies pop-up windows, and blocks unexpected navigation.

## Roadmap

The current focus is structured specification authoring. Likely future work includes review workflows, execution milestones, regression and coverage result tracking, richer exports, architecture diagrams, and integrations with issue trackers.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow. Please report security problems privately as described in [SECURITY.md](SECURITY.md).

## License

FeatureBuilder is released under the [MIT License](LICENSE).
