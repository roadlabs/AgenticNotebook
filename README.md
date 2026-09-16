# AgenticNotebook

A **pure-frontend, Jupyter-Notebook-style** web app focused on **Markdown cells + LLM execution**.
When you run a cell, the app sends the content of all prior cells plus the current cell as context to an LLM API, and streams the response back into the current cell's output area.

Agnes is the default provider, but **Base URL / API Key / Model** can all be changed to any OpenAI-compatible endpoint (DeepSeek, OpenAI, Moonshot, Zhipu GLM, Ollama, etc.).

Supports **multiple notebooks** (saved in the browser's IndexedDB), a **preview/edit dual mode** (Jupyter-style: auto-renders after Run), **Markdown + LaTeX rendering**, and **drag-to-reorder**.

Besides plain Markdown cells, there is also a **Tool cell** (`</>` badge): write text plus optional JS code, and Ctrl+Enter lets the LLM **generate tool code** for you, or **really executes the code and tests locally** in the browser. Registered tools become **tools** in a global Registry, and when you run ordinary Markdown cells afterwards, the LLM can **call these local tools** (function calling).

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
| **`</>` / `M`** | **Switch cell type**: a normal cell shows `</>` (click to turn it into a Tool cell); a Tool cell shows `M` (click to turn it back into a normal Markdown cell). The switch keeps content and output, and saves immediately |
| **👁** | Toggle preview/source mode (eye = in source; click to switch to preview as ✏; auto-switches to preview after running) |
| **⏫** | Insert a blank cell **above** the current one and focus it |
| **⏬** | Insert a blank cell **below** the current one and focus it |
| **🧹** | Clear the current cell's output (including error/running state) |
| **🗑** | Delete the current cell (the last remaining cell can't be deleted; a confirm prompt appears) |

**Double-click the preview area** to return to source editing mode (Jupyter style).

### Other operations

- **Shift+Enter** (inside a cell): run the current cell, then move focus to the next cell; if it's the last one, a new empty cell is auto-inserted
- **Ctrl+Enter** (inside a Tool cell): run the Tool cell (see "Tool cell" below; Ctrl or ⌘ both work)
- **❓ Help button** (top-right toolbar): opens the "Help & Shortcuts" modal listing all shortcuts and Tool cell usage
- **Drag a cell's top bar** (anywhere): reorder cells. Drop on the upper half of a target cell → insert before it; lower half → insert after it. The dragged cell becomes semi-transparent, and a blue indicator line shows the target position
- **Click the notebook name** in the top bar: prompt to rename

---

## Command Mode (Jupyter-style shortcuts)

The app supports Jupyter's **command mode**: press **Esc** inside any cell to enter it (the current cell is highlighted and its editor loses focus), and press **Esc** or **Enter** again to return to editing. Common shortcuts while in command mode:

| Shortcut | What it does |
|---|---|
| **Enter** / **Esc** | Edit the selected cell (Enter also leaves render-preview mode) |
| **J** / **K** (or **↓** / **↑**) | Move the selection up / down |
| **A** / **B** | Insert a new cell above / below the selection and start editing it |
| **D D** | Press **D** twice quickly to delete the selected cell |
| **O O** | Press **O** twice quickly to clear the selected cell's output |
| **M** / **Y** | Convert the selected cell to a Markdown / Tool cell (content and output preserved) |

Two small differences from Jupyter:

- **J/K do not wrap**: at the first or last cell the selection stays put instead of looping to the other end.
- **A/B drop straight into edit mode**: Jupyter stays in command mode; this app follows its own ⏫/⏬ toolbar convention and focuses the newly inserted cell immediately.

Clicking a cell's input or label area also enters edit mode directly (Esc is the only way into command mode).

---

## Tool Cell (`</>`)

A second cell type alongside normal Markdown cells. Two ways to create one: **Edit ▸ New Tool Cell** creates one at the end, or **hover any cell and click the `</>` button** to convert an existing cell into a Tool cell (click `M` to convert it back). A Tool cell shows a **`</>`** badge in its top bar (a code icon hinting that executable JS lives here); normal Markdown cells carry no type marker (following Jupyter's convention: code cells get `In[n]` prompts/line numbers, markdown cells stay quiet). The `type` is persisted on save, so a Tool cell stays a Tool cell after refresh.

**It runs with Ctrl+Enter** (or the ▶ button — same effect). Based on the cell content, two modes apply:

### Mode A: text only → LLM generates the code

When the cell has only text (no code fence), Ctrl+Enter sends that text to the LLM as a "generate a tool" prompt. The LLM's reply is expected to contain two fences:

````
```tool-def
{ "name": "...", "description": "...", "parameters": { ... JSON Schema ... } }
```

```js
function name(...) { ... }
```
````

When generation finishes: the code is **appended to the input box** as a ```` ```js ```` fence and the cell auto-switches to the rendered preview; the tool (name from `tool-def`'s `name`, falling back to the function name) is **immediately registered into the global Registry**.

### Mode B: text + code → local real execution + LLM evaluation

When the cell has both text and code, Ctrl+Enter will:

1. **Really execute the code locally**: the function inside the ```` ```js ```` fence runs in an **isolated Web Worker** (no page freeze; an infinite loop is terminated with an error after ~5 seconds).
2. Run two optional sources of verification:
   - ```` ```test ```` fence: **assertion code**, a `throw` means failure
   - `| input | expected |` table: each row is one **input/expected-output** pair (a JSON array input is spread as positional arguments); actual vs expected is compared with **lenient deep equality** (`1` vs `"1"` vs `1.0` all count as equal)
3. The output area shows the real **I/O table** (✓ pass / ✗ fail / error), **test block** results, and captured **console output**.
4. Then "tool description + code + real execution result + console logs" are all sent to the LLM, and the **evaluation report** appears below.
5. The tool (name from the function name, description from the first text line) is **registered into the global Registry** — even if the LLM evaluation fails, it still registers (the code itself ran).

### Global Registry & function calling

- Registered tools are persisted in IndexedDB (the `tools` key under `kv`), **global to the whole app** (not limited to the current notebook).
- **The settings modal (⚙) gained a "Registered Tools" list**: shows name/description, and each can be 🗑 deleted.
- After that, running an ordinary Markdown cell sends all registered tools to the LLM as an OpenAI-compatible `tools` array. If the LLM chooses to call one (`tool_calls`), the app **really executes that tool locally** (Worker-isolated), feeds the result back, looping at most 8 rounds until the LLM gives a final answer.

Example: create a Tool cell that registers `add(a,b)`, then ask in a Markdown cell "add(2,3)=?" — the LLM calls the local `add` tool, gets 5, and answers.

### Built-in notebook tools (notebook cell operations for the LLM)

Besides registry tools, running an ordinary Markdown cell also offers six **built-in** tools with the `notebook.` prefix, so the LLM can operate the notebook itself:

| Tool | What it does |
|---|---|
| `notebook.list_cells` | List cells: 1-based index, id, type, first line, content length, has-output |
| `notebook.add_cell` | Insert a cell (`position`: top / bottom / before / after, optional `content` / `type`) |
| `notebook.delete_cell` | Delete the cell at an index (refuses the last cell / the currently running cell) |
| `notebook.move_cell` | Move the cell at `index` to a final position `to` |
| `notebook.get_cell` | Read a cell's full content (+ output preview) |
| `notebook.clear_cell_output` | Clear a cell's output (refuses the currently running cell) |

- Cell indexes are **1-based**, matching the `[Cell N]` labels in the context.
- Built-ins run on the **main thread** (they mutate the notebook DOM directly); Tool-cell registry tools still run in a Web Worker.
- **Toggle**: the ⚙ settings modal has an *Allow built-in notebook tools* checkbox (on by default). Unchecking it stops the `notebook.*` tools from being sent; registry tools are unaffected. The `notebook.` prefix is reserved — a registered tool colliding with it is ignored with a console warning.

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
│   ├── cells.js            # cell list rendering, running, drag-reorder, preview toggle, Tool-cell flow
│   ├── editor.js           # CodeMirror 5 wrapper (with LaTeX inline overlay)
│   ├── llm.js              # OpenAI-compatible SSE streaming calls (incl. tool_calls parsing)
│   ├── settings.js         # LLM settings modal (incl. Registered Tools list)
│   ├── tools.js            # tool Registry + local execution (Web Worker) + parsing
│   └── storage.js          # IndexedDB wrapper
├── vendor/                 # everything vendored locally (CodeMirror / marked / highlight.js / KaTeX), zero CDN dependency
├── README.md               # English docs (this file)
├── README_cn.md            # Chinese docs
├── LICENSE                 # MIT
└── CLAUDE.md
```

No `package.json`, no build step. Vanilla JS (modules organized under the `window.Anb.*` global namespace to avoid the ES-module CORS restriction under `file://`).

---

## Known Limitations

- Tool code runs in an **isolated environment with no DOM / no fetch** (it can access `console`, `Math`, etc.), and cannot manipulate the page directly. When DOM work is needed, ask the LLM to abstract the operation into a **pure function** (returning data), then have the LLM organize the UI in an ordinary cell.
- If the Worker is unavailable (very old browsers), execution falls back to the main thread, where an **infinite loop would freeze the page**.
- Non-JSON-serializable return values (`undefined` / functions / `BigInt` / `Date` / `Error` / circular references) are tagged and handled; output over 10k characters is truncated.
- Tool registration is **by-name upsert**: re-registering a same-named tool updates it (`createdAt` is kept, `updatedAt` is refreshed).
- If you switch notebooks while a cell is running, output can occasionally be written to a stale DOM reference (rare; a page refresh recovers).
- CodeMirror 5 is the classic version with no native Markdown preview — use the 👁 button to toggle manually (it auto-switches after running).
- LaTeX only recognizes `$...$` and `$$...$$`; other delimiters like `\(...\)` / `\[...\]` are not supported.

---

## License

MIT
