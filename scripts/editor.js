// ============================================================
// editor.js — Thin wrapper around CodeMirror 5 (markdown mode)
// ============================================================

const CM_THEME_DARK = 'dracula';
const CM_THEME_LIGHT = 'default';

export function getCurrentCMTheme() {
  return document.documentElement.dataset.theme === 'light' ? CM_THEME_LIGHT : CM_THEME_DARK;
}

export function createEditor(parent, initialValue = '') {
  const cm = CodeMirror(parent, {
    value: initialValue,
    mode: 'markdown',
    theme: getCurrentCMTheme(),
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      // Shift+Enter: emit a custom event the cells module handles.
      // We use a custom DOM event so the editor's Shift+Enter doesn't
      // get intercepted by browser / CodeMirror defaults (which would
      // insert a newline). Bubbling: yes, so cells.js can listen.
      'Shift-Enter': (cm) => {
        const evt = new CustomEvent('cell:shift-enter', { bubbles: true });
        cm.getWrapperElement().dispatchEvent(evt);
      }
    }
  });

  return cm;
}

export function getValue(cm) {
  return cm.getValue();
}

export function setValue(cm, value) {
  cm.setValue(value);
}

export function focus(cm) {
  // refresh first to ensure proper sizing if recently hidden
  if (cm.getWrapperElement().offsetParent !== null) {
    cm.focus();
  } else {
    setTimeout(() => cm.focus(), 50);
  }
}

export function setTheme(cm, theme) {
  cm.setOption('theme', theme);
}

export function refresh(cm) {
  cm.refresh();
}

export function onChange(cm, handler) {
  cm.on('change', (instance) => {
    handler(instance.getValue());
  });
}

export function getWrapper(cm) {
  return cm.getWrapperElement();
}
