// ============================================================
// cells.js — Cell list rendering, run flow, drag-drop reorder
// (attaches to window.Anb.cells)
// ============================================================

window.Anb = window.Anb || {};

(function () {
  const Anb = window.Anb;
  const editor = Anb.editor;
  const llm = Anb.llm;

  let notebookEl = null;
  let saveNotebookDebounced = null;
  let cells = [];

  // --- public API ----------------------------------------------------------

  function init(notebookElement, debouncedSave) {
    notebookEl = notebookElement;
    saveNotebookDebounced = debouncedSave;
  }

  function getCells() {
    return cells;
  }

  function render(cellsData) {
    cells = (cellsData || []).map((c) => ({
      id: c.id || newId(),
      content: c.content || '',
      output: c.output || '',
      status: 'idle',
      cm: null,
      cellEl: null,
      outputEl: null,
      runBtn: null,
      labelEl: null
    }));

    if (cells.length === 0) {
      cells.push(createBlankCell());
    }

    notebookEl.innerHTML = '';
    for (const cell of cells) {
      renderCell(cell);
    }
    refreshAllLabels();
  }

  function newNotebook() {
    if (cells.length > 0 && !confirm('Discard current notebook and start fresh?')) return;
    cells = [createBlankCell()];
    notebookEl.innerHTML = '';
    renderCell(cells[0]);
    refreshAllLabels();
    saveNotebookDebounced();
    setTimeout(() => editor.focus(cells[0].cm), 50);
  }

  function addCell(position = 'below', atIndex = -1) {
    const newCell = createBlankCell();
    let insertAt;
    if (position === 'above') {
      insertAt = atIndex >= 0 ? atIndex : 0;
    } else {
      insertAt = atIndex >= 0 ? atIndex + 1 : cells.length;
    }
    cells.splice(insertAt, 0, newCell);

    rerenderAll();
    saveNotebookDebounced();

    setTimeout(() => editor.focus(newCell.cm), 50);
    return newCell;
  }

  function deleteCell(id) {
    if (cells.length <= 1) {
      alert('Cannot delete the last cell.');
      return;
    }
    const idx = cells.findIndex((c) => c.id === id);
    if (idx < 0) return;
    if (!confirm('Delete this cell?')) return;

    cells.splice(idx, 1);
    rerenderAll();
    saveNotebookDebounced();
  }

  function clearAllOutputs() {
    if (!confirm('Clear all cell outputs?')) return;
    for (const cell of cells) {
      cell.output = '';
      cell.status = 'idle';
      cell.outputEl.innerHTML = '';
      cell.cellEl.classList.remove('cell-running', 'cell-error');
      if (cell.runBtn) cell.runBtn.disabled = false;
    }
    saveNotebookDebounced();
  }

  async function runCell(id, settings) {
    const idx = cells.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const cell = cells[idx];

    if (!cell.content.trim()) {
      cell.outputEl.innerHTML = '<div class="output-empty">⚠ Empty cell — nothing to run.</div>';
      return;
    }

    const sysPrompt = `You are an AI assistant in an AgenticNotebook.
The user provides content from prior notebook cells as background context, then the current cell.
Respond only to the current cell, using prior cells as background.`;

    const userParts = cells.slice(0, idx + 1).map((c, k) => {
      const tag = k === idx ? ' (current)' : '';
      const body = c.content.trim() || '(empty)';
      return `[Cell ${k + 1}${tag}]\n${body}`;
    });
    const userContent =
      userParts.join('\n\n---\n\n') +
      `\n\nPlease respond to Cell ${idx + 1}.`;

    const messages = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userContent }
    ];

    cell.output = '';
    cell.status = 'running';
    cell.outputEl.innerHTML = '<div class="output-streaming">Running…</div>';
    cell.runBtn.disabled = true;
    cell.cellEl.classList.add('cell-running');
    cell.cellEl.classList.remove('cell-error');

    let accumulated = '';
    let renderTimer = null;

    function flushRender() {
      renderTimer = null;
      const liveCell = cells.find((c) => c.id === id);
      if (!liveCell) return;
      liveCell.outputEl.innerHTML = renderMarkdown(accumulated);
    }

    function scheduleRender() {
      if (renderTimer) return;
      renderTimer = setTimeout(flushRender, 200);
    }

    await llm.streamChatCompletion({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      messages,
      onChunk: (_delta, full) => {
        accumulated = full;
        scheduleRender();
      },
      onDone: (full) => {
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        accumulated = full;
        cell.output = accumulated;
        cell.outputEl.innerHTML = renderMarkdown(accumulated);
        cell.status = 'idle';
        cell.runBtn.disabled = false;
        cell.cellEl.classList.remove('cell-running');
        saveNotebookDebounced();
      },
      onError: (err) => {
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        const before = accumulated ? renderMarkdown(accumulated) : '';
        const errHtml = `<div class="output-error">❌ ${escapeHtml(err.message)}</div>`;
        cell.outputEl.innerHTML = before + errHtml;
        cell.output = accumulated;
        cell.status = 'error';
        cell.runBtn.disabled = false;
        cell.cellEl.classList.remove('cell-running');
        cell.cellEl.classList.add('cell-error');
        saveNotebookDebounced();
      }
    });
  }

  async function runAll(settings) {
    for (const cell of cells) {
      await runCell(cell.id, settings);
    }
  }

  function exportNotebook() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      cells: cells.map((c) => ({
        id: c.id,
        content: c.content,
        output: c.output
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentic-notebook-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- internals ------------------------------------------------------------

  function createBlankCell() {
    return {
      id: newId(),
      content: '',
      output: '',
      status: 'idle',
      cm: null,
      cellEl: null,
      outputEl: null,
      runBtn: null,
      labelEl: null
    };
  }

  function newId() {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function renderCell(cell) {
    const cellEl = document.createElement('div');
    cellEl.className = 'cell';
    cellEl.dataset.cellId = cell.id;

    // Top bar
    const topBar = document.createElement('div');
    topBar.className = 'cell-topbar';

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'cell-drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Drag to reorder';
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => onDragStart(e, cell.id));
    handle.addEventListener('mousedown', (e) => e.stopPropagation());
    topBar.appendChild(handle);

    const label = document.createElement('span');
    label.className = 'cell-label';
    cell.labelEl = label;

    const toolbar = document.createElement('div');
    toolbar.className = 'cell-toolbar';

    const runBtn = document.createElement('button');
    runBtn.className = 'cell-btn cell-run';
    runBtn.textContent = '▶';
    runBtn.title = 'Run cell (Shift+Enter)';
    runBtn.addEventListener('click', () => onRunClick(cell.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'cell-btn cell-del';
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete cell';
    delBtn.addEventListener('click', () => deleteCell(cell.id));

    toolbar.appendChild(runBtn);
    toolbar.appendChild(delBtn);
    topBar.appendChild(label);
    topBar.appendChild(toolbar);
    cellEl.appendChild(topBar);

    // Input host
    const inputHost = document.createElement('div');
    inputHost.className = 'cell-input';
    cellEl.appendChild(inputHost);

    // Output area
    const outputEl = document.createElement('div');
    outputEl.className = 'cell-output';
    if (cell.output) {
      outputEl.innerHTML = renderMarkdown(cell.output);
    }
    cellEl.appendChild(outputEl);

    cell.cellEl = cellEl;
    cell.outputEl = outputEl;
    cell.runBtn = runBtn;

    notebookEl.appendChild(cellEl);

    // Drop-target listeners on the whole cell
    cellEl.addEventListener('dragover', (e) => onDragOver(e, cell.id));
    cellEl.addEventListener('dragleave', (e) => onDragLeave(e, cell.id));
    cellEl.addEventListener('drop', (e) => onDrop(e, cell.id));
    cellEl.addEventListener('dragend', onDragEnd);

    // CodeMirror
    cell.cm = editor.createEditor(inputHost, cell.content);
    editor.onChange(cell.cm, (value) => {
      cell.content = value;
      refreshLabel(cell);
      saveNotebookDebounced();
    });
    editor.getWrapper(cell.cm).addEventListener('cell:shift-enter', () => {
      handleShiftEnter(cell.id);
    });
  }

  function rerenderAll() {
    const dataSnapshot = cells.map((c) => ({
      id: c.id,
      content: c.content,
      output: c.output
    }));
    notebookEl.innerHTML = '';
    render(dataSnapshot);
  }

  function refreshLabel(cell) {
    const idx = cells.indexOf(cell);
    if (idx < 0 || !cell.labelEl) return;
    const firstLine = (cell.content || '').split('\n')[0].slice(0, 60) || '(empty)';
    cell.labelEl.innerHTML =
      `<span class="label-idx">[${idx + 1}]:</span> ${escapeHtml(firstLine)}`;
  }

  function refreshAllLabels() {
    for (const cell of cells) refreshLabel(cell);
  }

  async function onRunClick(id) {
    const settings = await Anb.settings.load();
    await runCell(id, settings);
  }

  async function handleShiftEnter(id) {
    const settings = await Anb.settings.load();
    await runCell(id, settings);

    const idx = cells.findIndex((c) => c.id === id);
    if (idx < 0) return;
    if (idx + 1 < cells.length) {
      editor.focus(cells[idx + 1].cm);
    } else {
      addCell('below', idx);
    }
  }

  // --- drag & drop reordering ----------------------------------------------

  let dragSourceId = null;

  function onDragStart(e, cellId) {
    dragSourceId = cellId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cellId);
    setTimeout(() => {
      const cell = cells.find((c) => c.id === cellId);
      if (cell && cell.cellEl) cell.cellEl.classList.add('cell-dragging');
    }, 0);
  }

  function onDragOver(e, cellId) {
    if (!dragSourceId || dragSourceId === cellId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const cell = cells.find((c) => c.id === cellId);
    if (!cell || !cell.cellEl) return;

    const rect = cell.cellEl.getBoundingClientRect();
    const isAbove = e.clientY < rect.top + rect.height / 2;

    clearDropIndicators();
    cell.cellEl.classList.add(isAbove ? 'cell-drop-above' : 'cell-drop-below');
  }

  function onDragLeave(e, cellId) {
    const cell = cells.find((c) => c.id === cellId);
    if (!cell || !cell.cellEl) return;
    cell.cellEl.classList.remove('cell-drop-above', 'cell-drop-below');
  }

  function onDrop(e, targetId) {
    e.preventDefault();
    if (!dragSourceId || dragSourceId === targetId) {
      cleanupDrag();
      return;
    }

    const sourceIdx = cells.findIndex((c) => c.id === dragSourceId);
    const targetIdx = cells.findIndex((c) => c.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) {
      cleanupDrag();
      return;
    }

    const targetCell = cells[targetIdx];
    const rect = targetCell.cellEl.getBoundingClientRect();
    const isAbove = e.clientY < rect.top + rect.height / 2;

    const [source] = cells.splice(sourceIdx, 1);
    let insertAt = cells.findIndex((c) => c.id === targetId);
    if (!isAbove) insertAt += 1;
    cells.splice(insertAt, 0, source);

    cleanupDrag();
    rerenderAll();
    saveNotebookDebounced();

    const moved = cells.find((c) => c.id === dragSourceId);
    if (moved && moved.cm) {
      setTimeout(() => editor.focus(moved.cm), 50);
    }
  }

  function onDragEnd() {
    cleanupDrag();
  }

  function clearDropIndicators() {
    for (const c of cells) {
      if (c.cellEl) c.cellEl.classList.remove('cell-drop-above', 'cell-drop-below');
    }
  }

  function cleanupDrag() {
    for (const c of cells) {
      if (c.cellEl) {
        c.cellEl.classList.remove('cell-dragging', 'cell-drop-above', 'cell-drop-below');
      }
    }
    dragSourceId = null;
  }

  // --- markdown rendering ---------------------------------------------------

  function renderMarkdown(text) {
    if (!text) return '';
    try {
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          breaks: true,
          gfm: true,
          highlight: (code, lang) => {
            if (
              typeof hljs !== 'undefined' &&
              lang &&
              hljs.getLanguage(lang)
            ) {
              try {
                return hljs.highlight(code, { language: lang }).value;
              } catch {
                /* fall through */
              }
            }
            return escapeHtml(code);
          }
        });
        return marked.parse(text);
      }
    } catch (err) {
      console.warn('marked parse failed:', err);
    }
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- expose ---------------------------------------------------------------

  Anb.cells = {
    init,
    getCells,
    render,
    newNotebook,
    addCell,
    deleteCell,
    clearAllOutputs,
    runCell,
    runAll,
    exportNotebook
  };
})();
