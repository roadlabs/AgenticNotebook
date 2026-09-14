// ============================================================
// main.js — Entry point. Wires top bar, settings, cells.
// (No ES modules; attaches to window.Anb)
// ============================================================

(function () {
  const Anb = window.Anb;

  const DEFAULT_NOTEBOOK = () => [
    { id: `c-${Date.now().toString(36)}`, content: '', output: '' }
  ];

  let saveTimer = null;

  function debouncedSaveNotebook() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNotebook, 500);
  }

  async function saveNotebook() {
    saveTimer = null;
    const data = Anb.cells.getCells().map((c) => ({
      id: c.id,
      content: c.content,
      output: c.output
    }));
    try {
      await Anb.storage.set('notebook', { cells: data });
    } catch (err) {
      console.error('Failed to save notebook:', err);
    }
  }

  async function loadNotebook() {
    const n = await Anb.storage.get('notebook');
    if (n && Array.isArray(n.cells) && n.cells.length > 0) return n.cells;
    return DEFAULT_NOTEBOOK();
  }

  async function main() {
    // 1. Init IndexedDB
    await Anb.storage.init();

    // 2. Init cells module (wires save callback)
    Anb.cells.init(document.getElementById('notebook'), debouncedSaveNotebook);

    // 3. Load theme (before rendering cells, so CodeMirror picks correct theme)
    const savedTheme = await Anb.storage.get('theme');
    applyTheme(savedTheme || 'light');

    // 4. Load & render notebook
    const cellsData = await loadNotebook();
    Anb.cells.render(cellsData);

    // 5. Settings modal
    Anb.settings.setupModal({
      onSave: (settings) => {
        console.log('[settings] saved', { ...settings, apiKey: '***' });
      }
    });

    // 6. Top-bar buttons
    document.getElementById('btn-add-cell').addEventListener('click', () => {
      Anb.cells.addCell('below', Anb.cells.getCells().length - 1);
    });
    document.getElementById('btn-run-all').addEventListener('click', async () => {
      const settings = await Anb.settings.load();
      await Anb.cells.runAll(settings);
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
      Anb.cells.clearAllOutputs();
    });
    document.getElementById('btn-theme').addEventListener('click', async () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        await Anb.storage.set('theme', next);
      } catch (err) {
        console.error('Failed to persist theme:', err);
      }
    });

    // 7. Menu actions
    document.querySelectorAll('.menu-items li').forEach((li) => {
      li.addEventListener('click', async () => {
        const action = li.dataset.action;
        const details = li.closest('details');
        if (details) details.removeAttribute('open');
        await handleMenuAction(action);
      });
    });

    async function handleMenuAction(action) {
      switch (action) {
        case 'new':
          Anb.cells.newNotebook();
          break;
        case 'save':
          await saveNotebook();
          flashStatus('Notebook saved.');
          break;
        case 'export':
          Anb.cells.exportNotebook();
          break;
        case 'add-below':
          Anb.cells.addCell('below', Anb.cells.getCells().length - 1);
          break;
        case 'add-above':
          Anb.cells.addCell('above', 0);
          break;
        case 'clear-outputs':
          Anb.cells.clearAllOutputs();
          break;
        default:
          console.warn('Unknown menu action:', action);
      }
    }

    // 8. Click-outside closes any open <details> menus
    document.addEventListener('click', (e) => {
      document.querySelectorAll('details.menu[open]').forEach((d) => {
        if (!d.contains(e.target)) d.removeAttribute('open');
      });
    });

    // 9. Focus the first cell on load
    const firstCell = Anb.cells.getCells()[0];
    if (firstCell && firstCell.cm) {
      setTimeout(() => Anb.editor.focus(firstCell.cm), 150);
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';

    const cmTheme = Anb.editor.getCurrentCMTheme();
    for (const cell of Anb.cells.getCells()) {
      if (cell.cm) Anb.editor.setTheme(cell.cm, cmTheme);
    }
  }

  let statusTimer = null;
  function flashStatus(msg) {
    let statusEl = document.getElementById('status-flash');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'status-flash';
      statusEl.style.cssText = `
        position: fixed; bottom: 16px; right: 16px;
        background: var(--accent); color: white;
        padding: 8px 16px; border-radius: 4px;
        font-size: 13px; z-index: 2000;
        box-shadow: var(--shadow);
        opacity: 0; transition: opacity 0.2s;
      `;
      document.body.appendChild(statusEl);
    }
    statusEl.textContent = msg;
    statusEl.style.opacity = '1';
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.style.opacity = '0';
    }, 1800);
  }

  // Expose for debugging / testing if needed
  window.Anb = window.Anb || {};
  window.Anb.main = { applyTheme, saveNotebook };

  main().catch((err) => {
    console.error('Failed to start AgenticNotebook:', err);
    document.body.innerHTML = `
      <div style="padding:24px;color:#ff6b6b;font-family:monospace;">
        <h2>Failed to start AgenticNotebook</h2>
        <pre>${(err && err.stack) || err}</pre>
      </div>`;
  });
})();
