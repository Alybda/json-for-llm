# JSON for LLM

[中文说明](./README.zh-CN.md)

`JSON for LLM` is a zero-build Manifest V3 browser extension for LLM builders who constantly work with JSON in docs, logs, playgrounds, and API responses.

Select a complete JSON block or just a fragment on any page, then turn it into reusable outputs without leaving the browser:

- Pretty JSON
- Minified JSON
- Escaped / unescaped JSON
- JSON Schema
- OpenAI Structured Output schema
- Pydantic models
- Go structs
- TypeScript types

![JSON for LLM Tool Page](./assets/readme/tool-page.png)

## Why

When building LLM apps, a lot of JSON work still happens in the browser:

- reading API responses
- inspecting logs and traces
- copying tool arguments
- turning examples into schemas or typed models

Most tools require context switching into an online formatter, an IDE, or a CLI. `JSON for LLM` is built to keep that workflow in-place.

## Features

- Expand partial selections into the nearest valid JSON object or array.
- Accept common JSON-like literals such as `True`, `False`, and `None`.
- Generate multiple developer-friendly outputs from the same source JSON.
- Copy outputs directly from the context menu.
- Open an editable Tool Page workspace for inspection and regeneration.
- Persist settings in `chrome.storage.local`.
- Toggle context menu entries individually.
- Switch UI language between English and Simplified Chinese.
- Enable debug mode to capture expansion details for troubleshooting.
- Run fully client-side with a no-build codebase.

## Workflow

1. Select JSON or part of a JSON structure on any web page.
2. Right-click and choose a `JSON for LLM` action.
3. The extension tries to expand the selection into complete JSON.
4. It either copies the requested output immediately or opens the Tool Page.
5. You can edit the expanded JSON and regenerate every output from the same workspace.

## Install Locally

Chrome / Chromium:

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the repository root

Then:

- right-click any selection to use the context menu
- click the extension action to open the Tool Page
- open the extension options page for language, debug, and menu settings

## Current Outputs

- `Pretty JSON`
- `Minify JSON`
- `Escape JSON`
- `Unescape JSON`
- `Generate JSON Schema`
- `Generate OpenAI Schema`
- `Generate Pydantic Model`
- `Generate Go Struct`
- `Generate TypeScript Type`

## Project Status

This repository is currently an MVP, but it is already usable for day-to-day JSON shaping work in the browser.

Implemented today:

- MV3 background service worker
- offscreen clipboard fallback
- dedicated Tool Page
- dedicated Options page
- local settings persistence
- bilingual UI
- release packaging script

Planned next:

- better OpenAI schema compatibility checks
- JSONPath helpers
- richer type inference
- saved history / snippets
- store-ready packaging and distribution flow

## Repository Layout

```text
.
├── manifest.json
├── _locales/
├── assets/
├── scripts/
│   └── release.sh
└── src/
    ├── background/
    ├── offscreen/
    ├── options-page/
    ├── shared/
    └── tool-page/
```

## Development Notes

- This is intentionally a zero-build project.
- Source files are plain HTML, CSS, and ES modules.
- Core JSON expansion and generation logic lives in `src/shared/json-core.js`.
- Extension settings are managed via `src/shared/config.js`.
- Release archives are created with `./scripts/release.sh`.

## Create a Release Archive

Generate a local release zip:

```bash
./scripts/release.sh
```

Add an optional suffix:

```bash
./scripts/release.sh beta
```

The archive is written to `dist/` and includes only the files needed to load the extension.

## Privacy

`JSON for LLM` works locally in the browser extension runtime. It does not require a remote backend to format JSON, generate schemas, or produce code models.

## License

MIT
