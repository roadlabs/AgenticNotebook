# AgenticNotebook

一个**纯前端、类 Jupyter Notebook** 的页面应用，专注于 **Markdown Cell + LLM 执行**。
每个 cell 执行时，会把该 cell 之前的所有 cell 内容作为上下文，连同当前 cell 内容一同提交给 LLM API，返回结果写回当前 cell 的输出区。

默认使用 DeepSeek，但 Base URL / API Key / Model 全部可改成任意 OpenAI 兼容端点（OpenAI、Moonshot、智谱等）。

---

## 启动

### 方式 A：直接打开（最简单）

双击 `index.html` 即可在浏览器中打开。  
应用的所有数据（设置 + 笔记本内容）保存在浏览器的 **IndexedDB** 中。

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
   - **Base URL**：默认 `https://api.deepseek.com`
   - **API Key**：在 [DeepSeek 开放平台](https://platform.deepseek.com/) 申请
   - **Model**：默认 `deepseek-chat`
3. 点 **Save**。设置存到 IndexedDB。
4. 在出现的空 cell 里写 markdown，按 **Shift+Enter** 运行，或 hover 到 cell 右上角点 **▶**。

---

## 主题

默认浅色。点右上角 **☀/🌙** 切换深色 / 浅色。选择会持久化到 IndexedDB。

代码块（fenced code）在两种主题下都保持深色背景（与 GitHub 浅色页面的处理方式一致），保证 highlight.js 的语法高亮配色始终清晰。

## 顶栏说明

| 按钮 | 作用 |
|---|---|
| **File ▾** | New Notebook（清空 + 新建）、Save Notebook（强制保存）、Export as JSON（下载 `.json`） |
| **Edit ▾** | Add Cell Below / at Top、Clear All Outputs |
| **+Cell** | 在末尾追加一个 cell |
| **▶▶ All** | 按顺序串行运行所有 cell |
| **🧹 Clear** | 清空所有 cell 的输出 |
| **⚙** | 打开 LLM 设置弹窗 |
| **☀/🌙** | 切换深色 / 浅色主题 |

### Cell 操作

- **▶**：运行当前 cell（拼上下文 → 调 LLM → 流式写入输出区）
- **🗑**：删除当前 cell（最后一个 cell 不能删）
- **Shift+Enter**（在 cell 内）：运行当前 cell，然后焦点跳到下一个 cell；若已是最后一个，自动新建一个
- **拖拽左侧 ⋮⋮ 手柄**：调整 cell 顺序。拖到目标 cell 的上半区 → 插到它前面；下半区 → 插到它后面。被拖的 cell 会半透明，目标位置有蓝色指示线。

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

## 切换其他 LLM 厂商

设置里把 Base URL / Model 改掉就行，常见对照：

| 厂商 | Base URL | Model 例子 |
|---|---|---|
| DeepSeek（默认） | `https://api.deepseek.com` | `deepseek-chat` |
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
├── index.html              # HTML shell，CDN 引入 CodeMirror / marked / highlight.js
├── styles/
│   ├── main.css            # 顶栏、菜单、布局、主题变量
│   └── cells.css           # cell 输入/输出/hover 工具条样式
├── scripts/
│   ├── main.js             # 入口，组装各模块
│   ├── cells.js            # cell 列表渲染、运行流程
│   ├── editor.js           # CodeMirror 包装
│   ├── llm.js              # OpenAI 兼容 SSE 流式调用
│   ├── settings.js         # 设置弹窗
│   └── storage.js          # IndexedDB 封装
├── README.md
└── CLAUDE.md
```

无 `package.json`、无构建步骤。原生 ES modules。

---

## 已知限制（v1）

- 不支持代码 cell、不支持变量持久化、不支持 `.ipynb` 导入/导出。
- 运行 cell 时如果同时增删 cell，可能出现 output 写入到旧 DOM 引用的问题（罕见）。
- 拖拽排序后会重新渲染所有 cell，CodeMirror 焦点会丢（光标位置保留）。
- 切换主题会保留 cell 内容（不会丢），但 CodeMirror 的焦点会丢。
- CodeMirror 5 是经典版本，没有自动 markdown 预览（在输出区渲染）。

---

## License

MIT
