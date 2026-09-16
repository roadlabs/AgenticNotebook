# AgenticNotebook

A **pure-frontend, Jupyter-Notebook-style** web app focused on **Markdown cells + LLM execution**.
When you run a cell, the app sends the content of all prior cells plus the current cell as context to an LLM API, and streams the response back into the current cell's output area.

Agnes is the default provider, but **Base URL / API Key / Model** can all be changed to any OpenAI-compatible endpoint (DeepSeek, OpenAI, Moonshot, Zhipu GLM, Ollama, etc.).

Supports **multiple notebooks** (saved in the browser's IndexedDB), a **preview/edit dual mode** (Jupyter-style: auto-renders after Run), **Markdown + LaTeX rendering**, and **drag-to-reorder**.

---

## Getting Started

### Option A: Open directly (simplest)

Double-click `index.html` to open it in a browser.
All app data (settings + all notebooks) is stored in the browser's **IndexedDB**.

> **Why does it work from `file://`?** The project deliberately avoids ES modules (Chrome enforces CORS on `type="module"` scripts under `file://`, which would break the entire app). Instead, plain `<script>` tags load in dependency order and attach to a `window.Anb` namespace, so it runs in any browser even from `file://`.
>
> Most major LLM providers (DeepSeek / OpenAI / Moonshot / Zhipu) allow CORS requests from browsers, so API calls work fine over `file://` too.

### Option B: Local HTTP server (if Option A hits a CORS error)

```sh
cd /Users/roadlabs/MyProjects2026/AgenticNotebook
python3 -m http.server 8765
```

Open `http://localhost:8765/` in your browser.

---

## First Use

1. Open the page, then click the **⚙** button in the top-right to open settings.
2. Fill in:
   - **Base URL**: defaults to `https://api.agnes-ai.cn/v1`
   - **API Key**: obtain one from the Agnes open platform
   - **Model**: defaults to `agnes-3.0-flash`
3. Click **Save**. Settings are stored in IndexedDB.
4. Type Markdown in the empty cell and press **Shift+Enter** to run it, or hover over the cell and click **▶** in the top-right.
5. After Shift+Enter the cell automatically switches to the rendered preview mode. **Double-click the preview** to return to source editing.

---

## Multiple Notebooks

The **current notebook's name** sits right next to `📓 AgenticNotebook` in the top bar — **click the name** to rename it (empty names are not allowed).

The `Notebook ▾` menu:

| Item | What it does |
|---|---|
| **New…** | Prompts for a name → creates a new notebook and switches to it |
| **Open…** | Opens a modal listing all saved notebooks (✓ marks the current one); click a row to switch, 🗑 on the right to delete |
| **Save** | Forces a save of the current notebook (manual trigger on top of the 500ms debounced auto-save) |
| **Import…** | Imports a JSON file as a new notebook and switches to it |
| **Export ▸ as JSON / as HTML / as App** | Exports the current notebook; JSON can be re-imported, HTML is a static snapshot, App is a **conversational agent** (details below); filename = `<notebook name>[-agent]-<timestamp>.{json,html}` |

The `Edit ▾` menu keeps: Add Cell Below / at Top, Clear All Outputs (global).

> **Data migration**: when upgrading from an old version (with a single global notebook), the old `notebook` key in IndexedDB is automatically converted into an entry named "Imported Notebook", and the old key is removed. Seamless upgrade.

---

## Theme

Light by default. Click **☀/🌙** in the top-right to toggle dark / light. The choice is persisted to IndexedDB.

Fenced code blocks keep a dark background in both themes (the same treatment GitHub's light pages use), so highlight.js syntax colors stay readable.

---

## Cell Toolbar (shown on hover)

Hovering over a cell reveals a row of small icon buttons on the right of its top bar:

| Icon | What it does |
|---|---|
| **▶** | Run the current cell (concatenate context → call LLM → stream into the output area) |
| **👁** | Toggle preview/source mode (eye = in source; click to switch to preview as ✏; auto-switches to preview after running) |
| **⏫** | Insert a blank cell **above** the current one and focus it |
| **⏬** | Insert a blank cell **below** the current one and focus it |
| **🧹** | Clear the current cell's output (including error/running state) |
| **🗑** | Delete the current cell (the last remaining cell can't be deleted; a confirm prompt appears) |

**Double-click the preview area** to return to source editing mode (Jupyter style).

### Other operations

- **Shift+Enter** (inside a cell): run the current cell, then move focus to the next cell; if it's the last one, a new empty cell is auto-inserted
- **Drag a cell's top bar** (anywhere): reorder cells. Drop on the upper half of a target cell → insert before it; lower half → insert after it. The dragged cell becomes semi-transparent, and a blue indicator line shows the target position
- **Click the notebook name** in the top bar: prompt to rename

---

## Context Concatenation Rules

When you run cell N, the app concatenates cells `[0..N]` into a single user message, like this:

```
[Cell 1]
(content of cell 1)

---

[Cell 2]
(content of cell 2)

---

...

[Cell N (current)]
(content of cell N)

---

Please respond to Cell N.
```

Plus a one-line system prompt telling the LLM "this is notebook context, respond only to the current cell".

> Content from cells before the current one is **background context**, **not conversation history**. Re-running cell 1 does not "forget" cell 2's content — it's still in cell 2's output, it just won't be re-sent as input to later cells (unless you re-run cell 2).

---

## Output Rendering

The output area parses Markdown with `marked` (GFM, tables, task lists, strikethrough), renders inline `$...$` and block `$$...$$` LaTeX with KaTeX, and syntax-highlights code blocks with highlight.js (always on a dark background). Markdown + LaTeX apply in both the **output area** and the **input preview mode**.

---

## Agent App Export (Export ▸ as App)

Exports the current notebook as a **self-contained conversational agent** (a single `.html` file):

- Opens into a chat interface; **the entire notebook's content is baked into the system prompt** as the agent's background knowledge (the notebook source isn't shown directly — it only serves as the agent's internal context)
- Built-in OpenAI-compatible streaming (SSE); replies render Markdown + KaTeX + code highlighting in real time
- At export time the current **Base URL / Model** are baked in as defaults (Agnes by default), editable via the ⚙ in the top-right; the **API Key is stored only in the local browser** (localStorage) and never enters the file
- Conversation history only lives for the current page session; 🗑 clears the conversation

Same caveats as the main app:
- Opens directly from `file://`; if a provider's CORS blocks `file://`, serve it with `python3 -m http.server` first
- The exported file references CDN (jsdelivr) copies of marked / highlight.js / KaTeX, so it needs a network connection to load (you need one to call the LLM anyway); "Export as HTML" is the zero-JS static version, fully viewable offline

---

## Switching LLM Providers

Just change Base URL / Model in settings. Common examples:

| Provider | Base URL | Model example |
|---|---|---|
| Agnes (default) | `https://api.agnes-ai.cn/v1` | `agnes-3.0-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Zhipu (GLM) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Self-hosted (OpenAI-compatible) | `http://localhost:11434/v1` (Ollama) | `llama3.1` |

Any `/v1/chat/completions` path with Bearer Token auth works.

---

## CORS Troubleshooting

If you see something like this in the DevTools Console:

- `Access to fetch at '...' has been blocked by CORS policy`
- `Preflight response is not successful`

Try, in order:

1. **Switch providers**: confirm the provider you're using allows CORS from browser origins. DeepSeek / OpenAI / Moonshot / Zhipu all do.
2. **Use an HTTP server**: start `python3 -m http.server` and visit `http://localhost:8765/`.
3. **Install a CORS extension** (local debugging only): Chrome has extensions like "Allow CORS", but long-term use isn't recommended.

---

## File Structure

```
AgenticNotebook/
├── index.html              # HTML shell; loads all vendor libs + app scripts
├── styles/
│   ├── main.css            # top bar, menus, modals, notebook-name slot, theme variables
│   └── cells.css           # cell input/output/hover toolbar/preview area
├── scripts/
│   ├── main.js             # entry point; assembles modules + handles menu actions
│   ├── notebooks.js        # multi-notebook index (create/switch/delete/import/export JSON)
│   ├── cells.js            # cell list rendering, running, drag-reorder, preview toggle
│   ├── editor.js           # CodeMirror 5 wrapper (with LaTeX inline overlay)
│   ├── llm.js              # OpenAI-compatible SSE streaming calls
│   ├── settings.js         # LLM settings modal
│   └── storage.js          # IndexedDB wrapper
├── vendor/                 # everything vendored locally (CodeMirror / marked / highlight.js / KaTeX), zero CDN dependency
├── README.md               # English docs (this file)
├── README_cn.md            # Chinese docs
├── LICENSE
└── CLAUDE.md
```

No `package.json`, no build step. Vanilla JS (modules organized under the `window.Anb.*` global namespace to avoid the ES-module CORS restriction under `file://`).

---

## Known Limitations (v1)

- No code cells, no variable persistence.
- If you switch notebooks while a cell is running, output can occasionally be written to a stale DOM reference (rare; a page refresh recovers).
- CodeMirror 5 is the classic version with no native Markdown preview — use the 👁 button to toggle manually (it auto-switches after running).
- LaTeX only recognizes `$...$` and `$$...$$`; other delimiters like `\(...\)` / `\[...\]` are not supported.

---

## License

MIT
