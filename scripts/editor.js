// ============================================================
// editor.js — CodeMirror 5 wrapper (attaches to window.Anb.editor)
// ============================================================

window.Anb = window.Anb || {};

(function () {
  const CM_THEME_DARK = 'dracula';
  const CM_THEME_LIGHT = 'default';

  function getCurrentCMTheme() {
    return document.documentElement.dataset.theme === 'light' ? CM_THEME_LIGHT : CM_THEME_DARK;
  }

  function createEditor(parent, initialValue = '') {
    const cm = CodeMirror(parent, {
      value: initialValue,
      mode: 'markdown',
      theme: getCurrentCMTheme(),
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      extraKeys: {
        // Shift+Enter: emit a custom bubbling event the cells module handles.
        // We use a custom DOM event so Shift+Enter doesn't just insert a newline.
        'Shift-Enter': (cm) => {
          const evt = new CustomEvent('cell:shift-enter', { bubbles: true });
          cm.getWrapperElement().dispatchEvent(evt);
        }
      }
    });

    return cm;
  }

  function getValue(cm) {
    return cm.getValue();
  }

  function setValue(cm, value) {
    cm.setValue(value);
  }

  function focus(cm) {
    if (cm.getWrapperElement().offsetParent !== null) {
      cm.focus();
    } else {
      setTimeout(() => cm.focus(), 50);
    }
  }

  function setTheme(cm, theme) {
    cm.setOption('theme', theme);
  }

  function refresh(cm) {
    cm.refresh();
  }

  function onChange(cm, handler) {
    cm.on('change', (instance) => {
      handler(instance.getValue());
    });
  }

  function getWrapper(cm) {
    return cm.getWrapperElement();
  }

  window.Anb.editor = {
    getCurrentCMTheme,
    createEditor,
    getValue,
    setValue,
    focus,
    setTheme,
    refresh,
    onChange,
    getWrapper
  };
})();
