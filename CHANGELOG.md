# Changelog

All notable changes to FeatureBuilder will be documented here.

## Unreleased

### Fixed

- Renaming a project no longer relies on `window.prompt()`, which Electron does not implement and
  which made renaming impossible in the packaged app. All modal prompts now run in-window.
- A cyclic parent chain is rejected when a project is loaded, and tree walks are iterative, so a
  hand-edited project can no longer overflow the stack and leave a blank window.
- A damaged recent-projects cache no longer makes every subsequent save fail.
- Autosave only clears the unsaved indicator when the saved snapshot is still current, and reports
  write failures instead of swallowing them.
- Imported archives are validated before they reach application state.
- Export reports cancellation and write failures instead of always claiming success.
- The browser backup is debounced and guarded, and warns once when a project outgrows it.
- Opening a project expands its own roots rather than keeping the previous project's.
- Feature keys and sibling ordering are derived inside the state updater, so rapid additions
  cannot produce duplicate keys or colliding orders.
- Renaming a requirement identifier updates the verification scenarios that link to it.
- An unresolved selection shows the project overview instead of silently editing another feature.
- Open-question rows keep their identity when one is removed.
- The project prefix, identifier, description, and timestamps are validated.
- Navigation targets are compared by origin, and packaged builds no longer carry the dev-server
  websocket source in their content-security policy.
- Saving refuses to adopt a folder that already contains unrelated files.

### Added

- Application menu with keyboard shortcuts, plus a command palette bound to `Cmd/Ctrl` + `K`.
- Undo and redo across every edit, with typing coalesced into single steps.
- A project overview with readiness, coverage, and blocking-issue counts across all features.
- Markdown specification export and CSV traceability export.
- Recent projects, a dependency editor, feature duplication, and sibling reordering by drag.
- Search now matches requirement, scenario, and design text rather than only keys, titles, and tags.
- Dark mode, visible focus states, reduced-motion support, and ARIA tree semantics.
- An error boundary that offers recovery instead of leaving a blank window.

### Changed

- Project validation lives in `shared/schema.cjs` and is used by both the main process and the
  renderer, so there is one set of rules.
- The renderer is split into components, hooks, and exporters rather than a single file.
- Dependencies are pinned to explicit ranges instead of `latest`.

## 0.1.0 - 2026-08-29

### Added

- Local-first Electron workspace for hardware feature specifications.
- Hierarchical feature authoring with structured requirements, design, and DV sections.
- Requirement-to-scenario links, traceability matrix, validation, and readiness scoring.
- Git-friendly project folders, archive export, autosave, and crash recovery.
- Cross-platform packaging configuration and automated quality/security checks.
