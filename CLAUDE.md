# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## What this directory is

`AgenticNotebook/` is a single self-contained web app: a **Jupyter-Notebook-style pure-frontend page** where each cell holds Markdown source, and running a cell sends all prior cells plus the current cell as context to an LLM API and writes the streamed response back to the cell's output area.

Supports multiple saved notebooks (per-notebook IndexedDB index), a preview/edit toggle per cell (Jupyter-style: auto-renders after Run, double-click preview returns to edit), Markdown + LaTeX rendering (KaTeX) in both input preview and output, HTML / JSON export, and whole-topbar drag-to-reorder.

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

There are no automated tests. Verify changes manually per the checklist at the bottom of `README.md` and the original plan at `/Users/roadlabs/.claude/plans/pure-coalescing-wigderson.md`.

## Architecture

Multi-file vanilla web app, ~10 files, ~1500 lines total. All state lives in the browser (IndexedDB); no backend.

### Data flow at runtime

1. `scripts/main.js` runs on page load → `storage.init()` (opens IndexedDB) → `notebooks.init({ onChange })` (loads the notebook index; on first run after upgrade, auto-migrates the legacy single `notebook` key into a new "Imported Notebook" entry).
2. `cells.init(...)` registers the notebook DOM element + a debounced save callback. `cells.render(Anb.notebooks.getCurrentCells())` builds a `<div class="cell">` per cell with a CodeMirror instance, an output area, and a hover toolbar (▶ / 👁 / ⏫ / ⏬ / 🧹 / 🗑).
3. On **Run Cell**: `cells.runCell(id, settings)` builds a single user message containing `[Cell 1]…---[Cell N (current)]…Please respond to Cell N.` plus a system prompt, then calls `llm.streamChatCompletion({...})`. SSE chunks are accumulated and the output `<div>` is re-rendered with `marked.parse()` + `renderMathInElement` (KaTeX) throttled at 200ms (final render on stream end).
4. After **Run / Shift+Enter**, `setCellPreview(id, true)` switches the cell to preview mode (CodeMirror wrapper hidden, `.cell-preview` shown with rendered markdown). Double-clicking the preview reverts.
5. On **Shift+Enter**: same as Run, then focus the next cell's CodeMirror (or insert + focus a new cell at the end). The focus order is critical: focus the next cell FIRST while the current one is still in edit mode, THEN collapse to preview — otherwise the layout shift on hiding the current wrapper can cause the browser to scroll the page to the top.

### Module boundaries

| File | Responsibility | Talks to |
|---|---|---|
| `index.html` | HTML shell. Loads vendored CodeMirror 5, marked, highlight.js, KaTeX scripts in dependency order. Topbar with Notebook ▾ / Edit ▾ menus, settings modal, open-notebook modal. | — |
| `styles/main.css` | Top bar, menus, modals, notebook-name slot, Open dialog, submenu (Export ▸), theme variables (CSS custom props, light default). Code blocks stay dark in both themes via `--code-bg/--code-fg`. | — |
| `styles/cells.css` | Cell visual treatment, CodeMirror tweaks, output markdown typography, `.cell-preview` typography, KaTeX sizing, drag indicators (`.cell-dragging`, `.cell-drop-above` / `.cell-drop-below`). | — |
| `scripts/main.js` | Entry. Wires top-bar buttons, menu actions, theme toggle, click-outside-to-close menus, open-modal list rendering, rename prompt, flash status. | storage, settings, cells, editor, notebooks (via `window.Anb.*`) |
| `scripts/notebooks.js` | Multi-notebook index in IndexedDB. Exposes `init / getCurrent / getCurrentCells / getName / getId / list / setCurrentCells / setCurrentName / createNew / switchTo / deleteNotebook / importFromData`. Legacy single-notebook migration runs here. `onChange` callback fires whenever the active notebook changes so `main.js` can refresh the topbar slot. | Anb.storage |
| `scripts/cells.js` | Cell list state. Public: `init / getCells / render / addCell / deleteCell / clearAllOutputs / clearCellOutput / runCell / runAll / exportNotebook / exportNotebookHtml / toggleCellPreview / setCellPreview`. Drag-and-drop reordering (HTML5 DnD on the whole `.cell-topbar`, dragstart aborts when target is inside `.cell-toolbar` or `.CodeMirror`). Markdown + KaTeX rendering of output via `renderMarkdown`. | Anb.editor, Anb.llm |
| `scripts/editor.js` | Thin CodeMirror 5 wrapper: `createEditor`, `getValue`, `setValue`, `focus`, `setTheme`, `refresh`, `onChange`, `getWrapper`. Defines a custom `tex-inline-overlay` mode combined with markdown via `CodeMirror.overlayMode`. Shift+Enter emits a bubbling `cell:shift-enter` CustomEvent. | CodeMirror (global) |
| `scripts/llm.js` | `streamChatCompletion({ baseUrl, apiKey, model, messages, onChunk, onDone, onError, signal })`. OpenAI-compatible SSE parser, error handling (HTTP status + JSON error body + network), `[DONE]` sentinel, `data: ` line splitting. | fetch (browser native) |
| `scripts/settings.js` | LLM settings modal (Base URL / API Key / Model), pre-fills from storage, saves on submit. | Anb.storage |
| `scripts/storage.js` | IndexedDB wrapper around `agentic_notebook` DB, `kv` store. Exposes `init / get / set / del` as Promises on `Anb.storage`. | indexedDB (browser native) |

### Storage schema (IndexedDB)

- DB: `agentic_notebook`, version 1, single object store `kv` (keyPath `key`)
- Records:
  - `{ key: 'settings',         value: { baseUrl, apiKey, model } }`
  - `{ key: 'notebooks',        value: { [id]: { id, name, cells: [...], createdAt, updatedAt } } }`
  - `{ key: 'currentNotebookId', value: 'nb-xxx' }`
  - `{ key: 'theme',            value: 'dark' | 'light' }`
- Legacy key `{ key: 'notebook', value: { cells: [...] } }` is auto-migrated on first run after upgrade to a new "Imported Notebook" entry in `notebooks`, then deleted.
- Defaults on first run: DeepSeek base URL + `deepseek-chat` model, empty API key, light theme, one notebook named "untitle" with one empty cell.

### Critical conventions

- **No bundler, no ES modules.** Scripts are plain `<script>` tags loaded in dependency order (`storage → editor → llm → settings → notebooks → cells → main`). Each attaches its public API to `window.Anb.<module>`. Cross-module calls use `Anb.storage.get(...)`, `Anb.notebooks.setCurrentCells(...)`, `Anb.llm.streamChatCompletion(...)`, etc. This is the deliberate trade-off that makes the app work from `file://` (Chrome blocks ES module loading from `file://`).
- **No framework.** jQuery / React / Vue are not used.
- **No CDN at runtime.** All third-party libs (CodeMirror 5.65, marked 11.1, highlight.js 11.9, KaTeX 0.16.11) are vendored under `vendor/` — committed to the repo. The app has zero network dependencies and works fully offline.
- **Default theme is light.** `:root` carries dark fallback; `html[data-theme="light"]` overrides for the default light palette. The `<html>` element starts with `data-theme="light"`; `main.js` falls back to `'light'` if no theme is stored. CodeMirror theme toggles between `dracula` and `default` via `cm.setOption('theme', ...)`.
- **Code blocks stay dark in both themes.** `.cell-output pre / code` and `.cell-preview pre / code` use `--code-bg` / `--code-fg` variables that are NOT overridden under `html[data-theme="light"]`. This is so the github-dark hljs CSS remains readable when the page itself is light.
- **Save is debounced 500ms** on CodeMirror `change` events. Force-save via `Notebook ▸ → Save` (used by `main.js` flash status). Each save persists through `Anb.notebooks.setCurrentCells(...)` (which writes the full notebooks index).
- **Cell Run uses dynamic element lookup** (`cells.find(c => c.id === id).outputEl`) inside streaming callbacks so a re-render mid-stream doesn't lose output.
- **Shift+Enter propagation**: `editor.js` emits a bubbling `cell:shift-enter` CustomEvent; `cells.js` listens on the wrapper element and runs `handleShiftEnter`.
- **Drag-and-drop reordering**: the whole `.cell-topbar` is the drag source (`draggable=true`). The whole cell is the drop target; cursor Y vs cell midpoint decides above/below insert. Drop reorders the `cells` array then calls `rerenderAll()`. The `dragstart` handler aborts when `e.target.closest('.cell-toolbar')` or `.CodeMirror`, so the user can still click toolbar buttons and select text. CSS classes: `cell-dragging` (source opacity), `cell-drop-above` / `cell-drop-below` (top/bottom blue indicator).
- **Preview mode is preserved through rerenders.** `rerenderAll()` snapshots `previewMode` along with content/output and `render()` reads it back. This matters because adding a cell after Shift+Enter on the last cell otherwise loses the just-rendered preview state.
- **Export filenames** use `sanitizeFilename(Anb.notebooks.getName())-<ts>.{json,html}`. Illegal Windows/macOS chars (`/ \ : * ? " < > |` + control) become `_`; leading/trailing dots stripped; empty falls back to `untitle`.

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
| Add a new Notebook-menu entry that creates/switches/deletes a notebook | `scripts/notebooks.js` (add method) + `scripts/main.js` (handleMenuAction case) + `index.html` menu item |
| Change cell toolbar buttons | `scripts/cells.js` `renderCell()` toolbar block + (if new behavior) `cells.js` internals |

### External context

- Original plan: `/Users/roadlabs/.claude/plans/pure-coalescing-wigderson.md` (the v3 plan that bootstrapped the project).
- Sibling project with similar single-file / pure-frontend architecture (good reference for conventions): `/Users/roadlabs/MyProjects2026/OnePagent/`.
