# AgenticNotebook

一个**纯前端、类 Jupyter Notebook** 的页面应用，专注于 **Markdown Cell + LLM 执行**。
每个 cell 执行时，会把该 cell 之前所有 cell 内容作为上下文，连同当前 cell 内容一同提交给 LLM API，返回结果写回当前 cell 的输出区。

默认使用 Agnes，但 Base URL / API Key / Model 全部可改成任意 OpenAI 兼容端点（DeepSeek、OpenAI、Moonshot、智谱、Ollama 等）。

支持**多 notebook**（在浏览器 IndexedDB 中保存多个独立笔记本）、**预览/编辑双模式**（Jupyter 风格：Shift+Enter 提交后自动渲染）、**Markdown + LaTeX 渲染**、**拖拽排序**。

---

## 启动

### 方式 A：直接打开（最简单）

双击 `index.html` 即可在浏览器中打开。
应用的所有数据（设置 + 所有 notebook）保存在浏览器的 **IndexedDB** 中。

> **为什么能直接从 `file://` 跑？** 项目刻意没用 ES modules（Chrome 对 `file://` 下的 `type="module"` 脚本有 CORS 限制，会导致整个 main.js 加载失败）。改用普通 `<script>` 按依赖顺序加载，全部挂到 `window.Anb` 命名空间下，在任何浏览器 + `file://` 都能跑。
>
> 大多数主流 LLM 厂商（DeepSeek / OpenAI / Moonshot / 智谱）都允许来自浏览器的 CORS 请求，所以 `file://` 协议下 API 调用也基本可用。

### 方式 B：本地 HTTP server（如果方式 A 遇到 CORS 报错）

```sh
cd /Users/roadlabs/MyProjects2026/AgenticNotebook
python3 -m http.server 8765
```

浏览器打开 `http://localhost:8765/`。

---

## 第一次使用

1. 打开页面后，点右上角 **⚙** 打开设置。
2. 填入：
   - **Base URL**：默认 `https://api.agnes-ai.cn/v1`
   - **API Key**：在 Agnes 开放平台申请
   - **Model**：默认 `agnes-3.0-flash`
3. 点 **Save**。设置存到 IndexedDB。
4. 在出现的空 cell 里写 markdown，按 **Shift+Enter** 运行，或 hover 到 cell 右上角点 **▶**。
5. Shift+Enter 后 cell 会自动切到渲染预览模式（看到带格式的输出）。**双击预览区**可以回到源码编辑。

---

## 多 notebook

顶栏里 `📓 AgenticNotebook` 旁边就是**当前 notebook 的名称**——**点击名称**可以重命名（不支持空名）。

`Notebook ▾` 菜单：

| 项 | 作用 |
|---|---|
| **New…** | 弹 prompt 输入名字 → 新建 notebook 并切过去 |
| **Open…** | 弹模态对话框，列出所有已保存的 notebook（✓ 表示当前），点行切换，右边 🗑 删除 |
| **Save** | 强制保存当前（防抖 500ms 自动保存之外的手动触发） |
| **Import…** | 从 JSON 文件导入成一个新 notebook 并切过去 |
| **Export ▸ as JSON / as HTML** | 导出当前 notebook；文件名 = `<notebook 名>-<时间戳>.{json,html}` |

`Edit ▾` 菜单保留：Add Cell Below / at Top、Clear All Outputs（全局）。

> **数据迁移**：旧版本（只有一个全局 notebook）升级时，IndexedDB 里旧的 `notebook` key 会自动转成一条叫 "Imported Notebook" 的记录，旧的 key 删除。无感升级。

---

## 主题

默认浅色。点右上角 **☀/🌙** 切换深色 / 浅色。选择会持久化到 IndexedDB。

代码块（fenced code）在两种主题下都保持深色背景（与 GitHub 浅色页面的处理方式一致），保证 highlight.js 的语法高亮配色始终清晰。

---

## Cell 工具栏（hover 时显示）

每个 cell 的顶栏在鼠标悬停时右侧会展开一排小图标按钮：

| 图标 | 作用 |
|---|---|
| **▶** | 运行当前 cell（拼上下文 → 调 LLM → 流式写入输出区） |
| **👁** | 切换预览/源码模式（眼睛=在源码，点变 ✏=切到预览；运行后会自动切到预览） |
| **⏫** | 在当前 cell **上方**插入一个空白 cell 并 focus |
| **⏬** | 在当前 cell **下方**插入一个空白 cell 并 focus |
| **🧹** | 清空当前 cell 的输出（含 error/running 状态） |
| **🗑** | 删除当前 cell（最后一个 cell 不能删，会弹 confirm） |

**双击预览区**可以回到源码编辑模式（Jupyter 风格）。

### 其它操作

- **Shift+Enter**（在 cell 内）：运行当前 cell，焦点跳到下一个 cell；若是最后一个，自动新建一个空 cell
- **拖拽 cell 顶栏**（任意位置）：调整 cell 顺序。拖到目标 cell 的上半区 → 插到它前面；下半区 → 插到它后面。被拖的 cell 会半透明，目标位置有蓝色指示线
- **点击顶栏的 notebook 名**：弹 prompt 改名

---

## Context 拼接规则

当你运行 cell N 时，应用会把 cells `[0..N]` 的内容拼成一个 user 消息发出去，类似：

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

外加一行 system prompt 告诉 LLM「这是 notebook 上下文，请只针对当前 cell 回应」。

> 当前 cell 之前的内容是「背景」，**不是对话历史**。重新运行 cell 1 不会「忘记」cell 2 的内容 — 它仍然在 cell 2 的输出里，只是不会作为后续 cell 的输入再发一遍（除非重新运行 cell 2）。

---

## 输出渲染

输出区用 `marked` 解析 markdown（GFM、表格、任务列表、删除线），用 KaTeX 渲染行内 `$...$` 和块级 `$$...$$` 的 LaTeX，code block 用 highlight.js 上色（始终深色背景）。Markdown + LaTeX 同时在**输出区**和**输入预览模式**里都生效。

---

## 切换其他 LLM 厂商

设置里把 Base URL / Model 改掉就行，常见对照：

| 厂商 | Base URL | Model 例子 |
|---|---|---|
| Agnes（默认） | `https://api.agnes-ai.cn/v1` | `agnes-3.0-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 智谱 (GLM) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 自部署（OpenAI 兼容） | `http://localhost:11434/v1` (Ollama) | `llama3.1` |

只要是 `/v1/chat/completions` 这个路径 + Bearer Token 鉴权就行。

---

## CORS 故障排查

如果打开 DevTools Console 看到类似：

- `Access to fetch at '...' has been blocked by CORS policy`
- `Preflight response is not successful`

按顺序试：

1. **换厂商**：确认所用厂商是否对浏览器来源开放 CORS。DeepSeek / OpenAI / Moonshot / 智谱都允许。
2. **改用 HTTP server**：从 `python3 -m http.server` 启动，通过 `http://localhost:8765/` 访问。
3. **装 CORS 扩展**（仅本地调试）：Chrome 上有「Allow CORS」之类的扩展，但不建议长期使用。

---

## 文件结构

```
AgenticNotebook/
├── index.html              # HTML shell；引入所有 vendor 库 + app 脚本
├── styles/
│   ├── main.css            # 顶栏、菜单、modal、notebook 名 slot、主题变量
│   └── cells.css           # cell 输入/输出/hover 工具栏/预览区
├── scripts/
│   ├── main.js             # 入口，组装各模块 + 处理菜单动作
│   ├── notebooks.js        # 多 notebook 索引（创建/切换/删除/导入/导出 JSON）
│   ├── cells.js            # cell 列表渲染、运行、拖拽、预览切换
│   ├── editor.js           # CodeMirror 5 包装（含 LaTeX inline overlay）
│   ├── llm.js              # OpenAI 兼容 SSE 流式调用
│   ├── settings.js         # LLM 设置弹窗
│   └── storage.js          # IndexedDB 封装
├── vendor/                 # 全部本地化（CodeMirror / marked / highlight.js / KaTeX），零 CDN 依赖
├── README.md
└── CLAUDE.md
```

无 `package.json`、无构建步骤。原生 vanilla JS（用 `window.Anb.*` 全局命名空间组织模块，避免 file:// 下的 ES module CORS 限制）。

---

## 已知限制（v1）

- 不支持代码 cell、不支持变量持久化。
- 运行 cell 时如果同时切换 notebook，可能出现 output 写入到旧 DOM 引用的问题（罕见，刷新页面可恢复）。
- CodeMirror 5 是经典版本，没有原生 markdown 预览，需要用 👁 按钮手动切换（运行后会自动切）。
- LaTeX 仅识别 `$...$` 和 `$$...$$`，不支持 `\(...\)` / `\[...\]` 等其它分隔符。

---

## License

MIT
