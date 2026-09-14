# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

`AgenticNotebook/` is a single self-contained web app: a **Jupyter-Notebook-style pure-frontend page** where cells hold Markdown source, and running a cell sends all prior cells plus the current cell as context to an LLM API and writes the streamed response back to the cell's output area.

There is no build, no `package.json`, no bundler — just static HTML/CSS/JS. Open `index.html` directly (`file://`) or serve via `python3 -m http.server` (the latter if the LLM provider's CORS rejects `file://` origin).

## Commands

There is nothing to install or build. To preview:

```sh
# Option A: just open the file
open /Users/roadlabs/MyProjects2026/AgenticNotebook/index.html

# Option B: local HTTP server (fallback if CORS fails on file://)
cd /Users/roadlabs/MyProjects2026/AgenticNotebook
python3 -m http.server 8765
# then visit http://localhost:8765/
```

There are no tests. Verify changes manually by following the verification checklist at the bottom of `README.md` and the **Verification** section of `/Users/roadlabs/.claude/plans/pure-coalescing-wigderson.md`.

## Architecture

Multi-file ES-modules vanilla web app, ~10 files, ~700 lines total. All state lives in the browser (IndexedDB); no backend.

### Data flow at runtime

1. `scripts/main.js` runs on page load → calls `storage.init()` (opens IndexedDB) → loads theme / settings / notebook.
2. `cells.init(...)` registers the notebook DOM element + a debounced save callback.
3. `cells.render(cellsData)` builds a `<div class="cell">` per cell, attaches a CodeMirror instance to `.cell-input` and an output `<div class="cell-output">` below it.
4. On **Run Cell**: `cells.runCell(id, settings)` builds a single user message containing `[Cell 1]…---[Cell N (current)]…Please respond to Cell N.` plus a system prompt, then calls `llm.streamChatCompletion({...})`. SSE chunks are accumulated and the output `<div>` is re-rendered with `marked.parse()` throttled at 200ms (final render on stream end).
5. On **Shift+Enter**: same as Run, then focus the next cell's CodeMirror (or insert + focus a new cell at the end).

### Module boundaries

| File | Responsibility | Talks to |
|---|---|---|
| `index.html` | HTML shell, CDN script tags (CodeMirror 5, marked 11, highlight.js 11) | — |
| `styles/main.css` | Layout, top bar, menus, modal, theme variables (CSS custom props) | — |
| `styles/cells.css` | Cell visual treatment, CodeMirror tweaks, output markdown typography | — |
| `scripts/main.js` | Entry. Wires top-bar buttons, menu actions, theme toggle, click-outside-to-close menus | storage, settings, cells, editor |
| `scripts/cells.js` | Cell list state, render/delete/add/clear, run flow (builds messages, calls `llm.streamChatCompletion`), drag-and-drop reordering (HTML5 DnD via the `⋮⋮` handle), markdown render of output | editor, llm |
| `scripts/editor.js` | Thin CodeMirror 5 wrapper: `createEditor`, `getValue`, `setValue`, `focus`, `setTheme`, `onChange`. Shift+Enter is captured and emitted as a `cell:shift-enter` CustomEvent on the wrapper | CodeMirror (global) |
| `scripts/llm.js` | `streamChatCompletion({ baseUrl, apiKey, model, messages, onChunk, onDone, onError, signal })`. OpenAI-compatible SSE parser, error handling (HTTP status + JSON error body + network), `[DONE]` sentinel, `data: ` line splitting | fetch (browser native) |
| `scripts/settings.js` | LLM settings modal (Base URL / API Key / Model), pre-fills from storage, saves on submit | storage |
| `scripts/storage.js` | IndexedDB wrapper around `agentic_notebook` DB, `kv` store. Exports `init / get / set / del` as Promises | indexedDB (browser native) |

### Storage schema (IndexedDB)

- DB: `agentic_notebook`, version 1, single object store `kv` (keyPath `key`)
- Records:
  - `{ key: 'settings', value: { baseUrl, apiKey, model } }`
  - `{ key: 'notebook', value: { cells: [{ id, content, output }, ...] } }`
  - `{ key: 'theme',    value: 'dark' | 'light' }`
- Defaults on first run: DeepSeek base URL + `deepseek-chat` model, empty API key, dark theme, one empty cell.

### Critical conventions

- **No bundler.** All imports use relative paths with `.js` extension (required for browser-native ES modules).
- **No framework.** jQuery / React / Vue are not used.
- **CDN source.** All third-party libs (CodeMirror, marked, highlight.js) come from `cdn.bootcdn.net` — same as the sibling `OnePagent` project. No npm.
- **Default theme is dark.** CSS variables on `:root` define the palette; `html[data-theme="light"]` overrides for light mode. CodeMirror theme toggles between `dracula` and `default` via `cm.setOption('theme', ...)`.
- **Save is debounced 500ms** on CodeMirror `change` events. Force-save via `File ▾ → Save Notebook` (used by `main.js` flash status).
- **Cell Run uses dynamic element lookup** (`cells.find(c => c.id === id).outputEl`) inside streaming callbacks so that a re-render mid-stream doesn't lose output.
- **Shift+Enter propagation**: `editor.js` emits a bubbling `cell:shift-enter` CustomEvent; `cells.js` listens on the wrapper element and runs `handleShiftEnter`.
- **Drag-and-drop reordering**: each cell has a `⋮⋮` handle in the topbar (`draggable=true`). The whole cell is the drop target; cursor Y vs cell midpoint decides above/below insert. Drop reorders the `cells` array then calls `rerenderAll()`. CSS classes: `cell-dragging` (source opacity), `cell-drop-above` / `cell-drop-below` (top/bottom blue indicator).

### Where to make changes

| If you want to… | Edit |
|---|---|
| Change default LLM endpoint or add a "preset" dropdown | `scripts/settings.js` (`DEFAULTS`) + `index.html` modal markup |
| Change the context concatenation strategy (per-cell vs single message) | `scripts/cells.js` `runCell()` — the `userParts.map(...)` block |
| Change the system prompt | `scripts/cells.js` `runCell()` — `sysPrompt` |
| Change the markdown renderer or output styling | `scripts/cells.js` `renderMarkdown()` + `styles/cells.css` `.cell-output` rules |
| Change theme colors / add new theme | `styles/main.css` `:root` + `html[data-theme="light"]` |
| Add new keyboard shortcut | `scripts/editor.js` `extraKeys` (Shift+Enter is currently the only one) |
| Change SSE parsing or add non-streaming fallback | `scripts/llm.js` `streamChatCompletion()` |
| Change IndexedDB schema (bump `DB_VERSION` in `scripts/storage.js`) | Add `onupgradeneeded` migration; `scripts/storage.js` `openDB()` |
| Add a new top-bar button | `index.html` toolbar markup + `scripts/main.js` event listener |
| Add a new menu item | `index.html` `.menu-items` `<li data-action="...">` + `scripts/main.js` `handleMenuAction` switch |

### External context

- Plan file: `/Users/roadlabs/.claude/plans/pure-coalescing-wigderson.md` (the v3 plan that produced this codebase).
- Sibling project with similar single-file architecture (good reference for conventions): `/Users/roadlabs/MyProjects2026/OnePagent/`.
