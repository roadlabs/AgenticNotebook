// ============================================================
// settings.js — LLM settings modal (Base URL / API Key / Model)
// Persists to IndexedDB via storage.js
// ============================================================

import * as storage from './storage.js';

const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat'
};

export async function load() {
  const s = await storage.get('settings');
  return s ? { ...DEFAULTS, ...s } : { ...DEFAULTS };
}

export async function save(settings) {
  await storage.set('settings', settings);
}

export function setupModal({ onSave } = {}) {
  const modal = document.getElementById('settings-modal');
  const form = document.getElementById('settings-form');
  const baseUrlInput = document.getElementById('cfg-base-url');
  const apiKeyInput = document.getElementById('cfg-api-key');
  const modelInput = document.getElementById('cfg-model');
  const cancelBtn = document.getElementById('cfg-cancel');
  const settingsBtn = document.getElementById('btn-settings');

  async function open() {
    const s = await load();
    baseUrlInput.value = s.baseUrl;
    apiKeyInput.value = s.apiKey;
    modelInput.value = s.model;
    modal.classList.remove('hidden');
    setTimeout(() => baseUrlInput.focus(), 50);
  }

  function close() {
    modal.classList.add('hidden');
  }

  settingsBtn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);

  // Click backdrop to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      close();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const settings = {
      baseUrl: baseUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim()
    };
    await save(settings);
    if (typeof onSave === 'function') onSave(settings);
    close();
  });

  return { open, close };
}
