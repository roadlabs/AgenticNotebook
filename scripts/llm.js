// ============================================================
// llm.js — OpenAI-compatible streaming chat completion
// (attaches to window.Anb.llm)
// ============================================================

window.Anb = window.Anb || {};

(function () {
  /**
   * Stream a chat completion from an OpenAI-compatible endpoint.
   *
   * @param {Object} opts
   * @param {string} opts.baseUrl
   * @param {string} opts.apiKey
   * @param {string} opts.model
   * @param {Array}  opts.messages
   * @param {Array}  [opts.tools]      OpenAI `tools` array (function calling)
   * @param {Function} opts.onChunk    (delta, accumulated) => void
   * @param {Function} opts.onDone     (accumulated) => void
   * @param {Function} opts.onToolCall (tc) => void — per COMPLETE tool call,
   *                                   emitted at stream end; tc = {id,name,arguments}
   * @param {Function} opts.onError    (err) => void
   * @param {AbortSignal} [opts.signal]
   */
  async function streamChatCompletion(opts) {
    const { baseUrl, apiKey, model, messages, tools, onChunk, onDone, onToolCall, onError, signal } = opts;

    if (!apiKey) {
      onError(new Error('Missing API Key — open ⚙ Settings to set it.'));
      return;
    }
    if (!baseUrl) {
      onError(new Error('Missing Base URL — open ⚙ Settings to set it.'));
      return;
    }
    if (!model) {
      onError(new Error('Missing Model — open ⚙ Settings to set it.'));
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      onError(new Error('No messages to send.'));
      return;
    }

    // Accept either a bare origin ("https://api.example.com"), a
    // /v1 base ("https://api.example.com/v1"), or a full chat-completions
    // endpoint ("https://api.example.com/v1/chat/completions"). The
    // latter is what some providers (Agnes) publish in their docs.
    const trimmed = baseUrl.replace(/\/+$/, '');
    let url;
    if (/\/chat\/completions(\?|$)/.test(trimmed)) {
      url = trimmed;
    } else if (/\/v1$/.test(trimmed)) {
      url = `${trimmed}/chat/completions`;
    } else {
      url = `${trimmed}/v1/chat/completions`;
    }

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          ...(tools && tools.length ? { tools } : {})
        }),
        signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        onError(new Error('Request aborted.'));
      } else {
        onError(new Error(`Network error: ${err.message || err}`));
      }
      return;
    }

    if (!response.ok) {
      let errMsg = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errBody = await response.json();
        if (errBody.error && errBody.error.message) {
          errMsg = errBody.error.message;
        } else if (errBody.message) {
          errMsg = errBody.message;
        }
      } catch {
        try {
          const txt = await response.text();
          if (txt) errMsg = txt.slice(0, 200);
        } catch {}
      }
      onError(new Error(errMsg));
      return;
    }

    if (!response.body) {
      onError(new Error('Response has no body — streaming not supported?'));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';

    // Accumulate fragmented tool_calls deltas per index.
    // Each entry: { id, type, name, args } where `args` is the raw JSON string.
    const toolCallMap = new Map();

    function emitToolCalls() {
      if (typeof onToolCall !== 'function') return;
      const entries = Array.from(toolCallMap.entries()).sort((a, b) => a[0] - b[0]);
      for (const [, tc] of entries) {
        if (!tc.name) {
          // Some providers emit finish_reason:"tool_calls" without a name
          // (e.g. only when no deltas carried one) — skip rather than emit garbage.
          console.warn('llm: tool_calls chunk without a name skipped', tc);
          continue;
        }
        onToolCall({
          id: tc.id || 'call_' + tc.index,
          name: tc.name,
          arguments: tc.args || ''
        });
      }
      toolCallMap.clear();
    }

    function handleDelta(obj) {
      const delta = obj.choices?.[0]?.delta?.content;
      if (delta) {
        accumulated += delta;
        onChunk(delta, accumulated);
      }
      const tcs = obj.choices?.[0]?.delta?.tool_calls;
      if (!Array.isArray(tcs)) return;
      for (const tc of tcs) {
        // `index` is required by the OpenAI spec but some providers omit it
        // on continuation chunks; fall back to the most recent entry.
        const idx = tc.index !== undefined ? tc.index : toolCallMap.size - 1;
        let entry = toolCallMap.get(idx);
        if (!entry) {
          entry = { index: idx, id: null, type: 'function', name: null, args: '' };
          toolCallMap.set(idx, entry);
        }
        if (tc.id) entry.id = tc.id;
        if (tc.type) entry.type = tc.type;
        if (tc.function) {
          if (tc.function.name) entry.name = tc.function.name;
          if (tc.function.arguments != null) entry.args += tc.function.arguments;
        }
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            emitToolCalls();
            await onDone(accumulated);
            return;
          }

          let obj;
          try {
            obj = JSON.parse(payload);
          } catch {
            continue;
          }

          if (obj.error) {
            const msg = obj.error.message || obj.error.code || JSON.stringify(obj.error);
            onError(new Error(`API error: ${msg}`));
            return;
          }

          handleDelta(obj);
        }
      }
      emitToolCalls();
      await onDone(accumulated);
    } catch (err) {
      if (err.name === 'AbortError') {
        onError(new Error('Request aborted.'));
      } else {
        onError(new Error(`Stream interrupted: ${err.message || err}`));
      }
    }
  }

  window.Anb.llm = { streamChatCompletion };
})();
