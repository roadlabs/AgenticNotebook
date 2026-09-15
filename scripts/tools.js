// ============================================================
// tools.js — global tool registry + local execution + parsing
// (attaches to window.Anb.tools)
//
// Tools are registered by "Tool" cells and exposed to the LLM as
// OpenAI-compatible `tools` when running normal md cells. Execution
// is LOCAL, in a Web Worker, so generated code can call back into
// real behavior (the browser) without blocking the UI.
// ============================================================

window.Anb = window.Anb || {};

(function () {
  const Anb = window.Anb;

  // ------------------------------------------------------------------
  // Registry (IndexedDB kv 'tools' key, lazy-loaded)
  // ------------------------------------------------------------------

  let registry = null; // null = not loaded yet

  async function loadRegistry() {
    if (registry !== null) return registry;
    let r = null;
    try {
      r = await Anb.storage.get('tools');
    } catch (err) {
      console.warn('tools: failed to read registry', err);
    }
    registry = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
    return registry;
  }

  async function persist() {
    await Anb.storage.set('tools', registry);
  }

  /** @returns {Array<{name,description,parameters,code,createdAt,updatedAt}>} newest first */
  async function list() {
    await loadRegistry();
    return Object.keys(registry)
      .map((k) => registry[k])
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function get(name) {
    await loadRegistry();
    return registry[name] || null;
  }

  /** @returns {Array} OpenAI `tools` array — empty when nothing registered */
  async function toApiTools() {
    await loadRegistry();
    return Object.keys(registry).map((name) => ({
      type: 'function',
      function: {
        name,
        description: registry[name].description || '',
        parameters:
          registry[name].parameters && typeof registry[name].parameters === 'object'
            ? registry[name].parameters
            : {}
      }
    }));
  }

  /**
   * Upsert a tool by name.
   * @param {{name:string, description?:string, parameters?:object, code?:string}} def
   */
  async function register(def) {
    await loadRegistry();
    const name = String((def && def.name) || '').trim();
    if (!name) throw new Error('Cannot register tool: missing name.');
    const now = Date.now();
    const prev = registry[name];
    registry[name] = {
      name,
      description:
        (def && def.description) || (prev && prev.description) || '',
      parameters:
        def && def.parameters && typeof def.parameters === 'object'
          ? def.parameters
          : (prev && prev.parameters) || {},
      code: (def && def.code) || (prev && prev.code) || '',
      createdAt: prev ? prev.createdAt : now,
      updatedAt: now
    };
    await persist();
    return registry[name];
  }

  async function remove(name) {
    await loadRegistry();
    if (registry[name]) {
      delete registry[name];
      await persist();
    }
  }

  // ------------------------------------------------------------------
  // Content parsing — split a tool cell into text / code / tests / cases
  // ------------------------------------------------------------------

  /**
   * Split a tool cell's markdown content into its parts.
   * @returns {{text:string, code:string, codeLang:string, fnName:string,
   *           tests:string[], ioCases:Array<{input:any, expected:any}>}}
   */
  function parseContent(content) {
    const textParts = [];
    const tests = [];
    let code = '';
    let codeLang = '';
    const fenceRe = /```([\w-]*)\s*\n?([\s\S]*?)\n?```/g;
    let last = 0;
    let m;
    while ((m = fenceRe.exec(content || ''))) {
      textParts.push(content.slice(last, m.index));
      const lang = (m[1] || '').toLowerCase();
      const body = m[2];
      if (lang === 'test') {
        tests.push(body);
      } else if ((lang === 'js' || lang === 'javascript') && !code) {
        code = body;
        codeLang = lang;
      } else {
        textParts.push('```' + m[1] + '\n' + body + '\n```');
      }
      last = fenceRe.lastIndex;
    }
    textParts.push(content.slice(last));
    const text = textParts.join('').trim();
    return {
      text,
      code,
      codeLang,
      fnName: code ? deriveFnName(code) : '',
      tests,
      ioCases: extractIoCases(text)
    };
  }

  /** Extract I/O test tables (`| input | expected |`) from markdown text. */
  function extractIoCases(text) {
    const cases = [];
    const lines = String(text || '').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line.startsWith('|')) {
        i++;
        continue;
      }
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim());
        i++;
      }
      const parsed = parseIoTable(rows);
      if (parsed) cases.push(...parsed);
    }
    return cases;
  }

  function parseIoTable(rows) {
    if (rows.length < 2) return null;
    const cells = (r) =>
      r.replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
    const header = cells(rows[0]).map((h) => h.toLowerCase());
    const io = header.indexOf('input');
    const ex = header.indexOf('expected');
    if (io < 0 || ex < 0) return null;
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = cells(rows[r]);
      if (row.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))) continue; // separator
      out.push({
        input: parseCell(row[io]),
        expected: parseCell(row[ex])
      });
    }
    return out;
  }

  function parseCell(s) {
    if (s === undefined) return undefined;
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }

  /** Best-effort function name from generated code. */
  function deriveFnName(code) {
    const src = String(code || '');
    const decl = src.match(/function\s+([A-Za-z_$][\w$]*)/);
    if (decl) return decl[1];
    const assigned = src.match(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\(|(?:[A-Za-z_$][\w$]*)\s*=>)/m
    );
    if (assigned) return assigned[1];
    return '';
  }

  /** Parse the codegen response: ```tool-def JSON + ```js code. */
  function parseCodegen(text) {
    let toolDef = null;
    const defMatch = String(text || '').match(/```tool-def\s*\n?([\s\S]*?)```/);
    if (defMatch) {
      try {
        toolDef = JSON.parse(defMatch[1].trim());
      } catch {
        toolDef = null;
      }
    }
    const codeMatch = String(text || '').match(/```(?:js|javascript)\s*\n?([\s\S]*?)```/);
    return { toolDef, code: codeMatch ? codeMatch[1].trim() : '' };
  }

  // ------------------------------------------------------------------
  // Comparison + serialization
  // ------------------------------------------------------------------

  /** JSON-tolerant deep equality: 1 vs "1" vs 1.0 compare equal. */
  function deepEqual(a, b) {
    if (a === b) return true;
    const na = numOf(a);
    const nb = numOf(b);
    if (na !== undefined && nb !== undefined) return na === nb;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((x, i) => deepEqual(x, b[i]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every((k) => deepEqual(a[k], b[k]));
    }
    return false;
  }

  function numOf(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
    return undefined;
  }

  /**
   * Reduce any value to a JSON-safe representation (worker-postable).
   * Non-serializable types get tagged descriptors instead of throwing.
   */
  function safeSerialize(v) {
    if (v === undefined) return { __type: 'undefined' };
    if (v === null) return null;
    const t = typeof v;
    if (t === 'function') return { __type: 'function' };
    if (t === 'bigint') return { __type: 'bigint', value: v.toString() };
    if (t === 'symbol') return { __type: 'symbol', value: String(v) };
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (v instanceof Date) return { __type: 'date', value: v.toISOString() };
    if (v instanceof Error)
      return { __type: 'error', message: v.message, stack: v.stack };
    if (Array.isArray(v)) return v.map((x) => safeSerialize(x));
    if (t === 'object') {
      const seen = new WeakSet();
      function walk(o) {
        if (o === null || typeof o !== 'object') return safeSerialize(o);
        if (seen.has(o)) return { __type: 'circular' };
        seen.add(o);
        if (o instanceof Date) return { __type: 'date', value: o.toISOString() };
        if (o instanceof Error)
          return { __type: 'error', message: o.message, stack: o.stack };
        const out = {};
        for (const k of Object.keys(o)) out[k] = walk(o[k]);
        return out;
      }
      return walk(v);
    }
    return { __type: 'unknown', value: String(v) };
  }

  function truncate(s, max = 10000) {
    const str = String(s == null ? '' : s);
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  // ------------------------------------------------------------------
  // Local execution (Web Worker by default; main-thread fallback)
  // ------------------------------------------------------------------

  /**
   * The execution harness — runs inside a Worker (or the main thread as
   * a fallback). Evaluates the tool code inside a synthetic Function so
   * the tool's function AND each ```test block share one scope, letting
   * tests reference the function by name without global pollution.
   *
   * Returns { results: { io, tests }, logs }. Throws on setup failure.
   */
  async function runLocalHarness(payload) {
    const d = payload;
    const __deepEqual = this.__deepEqual;
    const __ser = this.__ser;

    // Capture console.* output produced by the tool code.
    const logs = [];
    const saved = {};
    const methods = ['log', 'warn', 'error', 'info', 'debug', 'trace', 'table'];
    for (const m of methods) {
      if (typeof console !== 'undefined' && console[m]) {
        saved[m] = console[m].bind(console);
        console[m] = function () {
          try {
            logs.push({ m: m, a: __ser(Array.prototype.slice.call(arguments)) });
          } catch (err) {
            logs.push({ m: m, a: ['<unserializable>'] });
          }
        };
      }
    }

    try {
      // Build one scope containing the tool code + one function per test,
      // returning the tool's function and the test functions.
      const testSrc =
        (d.tests || []).length > 0
          ? ', tests: [' +
            d.tests
              .map((t) => 'function(){\n' + t + '\n}')
              .join(',\n') +
            ']'
          : '';
      const factory = new Function(
        d.code + '\n; return { fn: ' + d.fnName + testSrc + ' };'
      );
      const wrapped = factory();

      const io = [];
      for (let i = 0; i < (d.ioCases || []).length; i++) {
        const c = d.ioCases[i];
        const args = Array.isArray(c.input) ? c.input : [c.input];
        try {
          let actual = wrapped.fn.apply(null, args);
          if (actual && typeof actual.then === 'function') actual = await actual;
          io.push({
            input: __ser(c.input),
            expected: __ser(c.expected),
            actual: __ser(actual),
            pass: __deepEqual(actual, c.expected),
            error: null
          });
        } catch (err) {
          io.push({
            input: __ser(c.input),
            expected: __ser(c.expected),
            actual: null,
            pass: false,
            error: String((err && err.message) || err)
          });
        }
      }

      const tests = [];
      for (const tf of wrapped.tests || []) {
        try {
          await tf();
          tests.push({ pass: true, error: null });
        } catch (err) {
          tests.push({ pass: false, error: String((err && err.message) || err) });
        }
      }

      for (const m of methods) {
        if (saved[m]) console[m] = saved[m];
      }

      return { results: { io, tests }, logs };
    } catch (err) {
      for (const m of methods) {
        if (saved[m]) console[m] = saved[m];
      }
      throw new Error(String((err && err.message) || err));
    }
  }

  /** Build the Worker source from the harness + helpers (self-contained). */
  function buildWorkerSource() {
    return (
      'var __deepEqual = ' + deepEqual.toString().replace(/deepEqual/g, '__deepEqual') + ';\n' +
      'var __ser = ' + safeSerialize.toString().replace(/safeSerialize/g, '__ser') + ';\n' +
      'var __harness = ' + runLocalHarness.toString() + ';\n' +
      'self.onmessage = async function(e) {' +
      '  try {' +
      '    var r = await __harness.call({ __deepEqual: __deepEqual, __ser: __ser }, e.data);' +
      '    self.postMessage({ type: "done", results: r.results, logs: r.logs });' +
      '  } catch (err) {' +
      '    self.postMessage({ type: "error", error: String(err && err.message || err) });' +
      '  }' +
      '};'
    );
  }

  function runInWorker(workerSrc, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let url = null;
      let worker = null;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (worker) worker.terminate();
        if (url) URL.revokeObjectURL(url);
        reject(new Error('Tool execution timed out after ' + timeoutMs + 'ms'));
      }, timeoutMs);

      try {
        url = URL.createObjectURL(new Blob([workerSrc], { type: 'application/javascript' }));
        worker = new Worker(url);
      } catch (err) {
        clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        reject(err);
        return;
      }

      worker.onmessage = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        worker.terminate();
        reject(new Error((e && e.message) || 'Worker error'));
      };
      worker.postMessage(payload);
    });
  }

  /**
   * Run tool code + tests locally.
   * @returns {Promise<{type:'done', results:{io:Array, tests:Array}, logs:Array,
   *                    fallback?:boolean} | {type:'error', error:string, logs:Array}>}
   */
  async function runLocal({ code, fnName, tests = [], ioCases = [], timeoutMs = 5000 }) {
    const payload = { code, fnName, tests, ioCases };
    const useWorker = typeof Worker === 'function';
    if (useWorker) {
      try {
        const workerSrc = buildWorkerSource();
        const res = await runInWorker(workerSrc, payload, timeoutMs);
        if (res && res.type === 'error') return res;
        return { type: 'done', results: res.results || { io: [], tests: [] }, logs: res.logs || [] };
      } catch (err) {
        if (String((err && err.message) || '').indexOf('timed out') !== -1) {
          return { type: 'error', error: String((err && err.message) || err), logs: [] };
        }
        console.warn('tools: worker path failed, falling back to main thread:', err && err.message);
      }
    }
    try {
      const r = await runLocalHarness.call(
        { __deepEqual: deepEqual, __ser: safeSerialize },
        payload
      );
      return { type: 'done', results: r.results, logs: r.logs, fallback: true };
    } catch (err) {
      return { type: 'error', error: String((err && err.message) || err), logs: [] };
    }
  }

  /**
   * Execute a registered tool by name with parsed JSON arguments.
   * Array args are spread positionally; anything else is passed as one arg.
   * @returns {Promise<any>} the tool's JSON-safe return value
   */
  async function execute(name, args) {
    const rec = await get(name);
    if (!rec) throw new Error('Tool "' + name + '" is not registered.');
    const res = await runLocal({
      code: rec.code,
      fnName: deriveFnName(rec.code),
      tests: [],
      ioCases: [{ input: Array.isArray(args) ? args : [args] }]
    });
    if (res.type === 'error' || !res.results || !res.results.io.length) {
      throw new Error((res.error) || 'Tool "' + name + '" produced no result.');
    }
    const row = res.results.io[0];
    if (row.error) throw new Error(row.error);
    return row.actual;
  }

  // ------------------------------------------------------------------

  window.Anb.tools = {
    list,
    get,
    toApiTools,
    register,
    remove,
    parseContent,
    parseCodegen,
    deriveFnName,
    deepEqual,
    safeSerialize,
    truncate,
    runLocal,
    execute
  };
})();
