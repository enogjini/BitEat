'use strict';

/**
 * A stand-in for the `pg` module.
 *
 * The npm registry is not reachable from this project's CI sandbox, so the
 * suite cannot depend on jest/sinon/supertest. This module is the whole
 * mocking layer: it records every query the API issues and answers each one
 * from a list of registered handlers.
 *
 * Usage inside a test:
 *
 *   db.when(/FROM punonjesit/, { rows: [{ punonjes_id: 1 }] });
 *   ...make the request...
 *   assert.equal(db.calls.length, 1);
 *   assert.deepEqual(db.calls[0].params, ['admin', 'secret']);
 */

const db = {
  /** Every query issued since the last reset, in order. */
  calls: [],
  /** Registered responders, newest last. */
  handlers: [],
  /** Clients handed out by pool.connect(), so tests can assert release(). */
  clients: [],
  /** Config the API passed to `new Pool(...)`. */
  lastPoolConfig: null,

  /**
   * Answer any query matching `pattern` with `result`.
   * @param {RegExp|string} pattern matched against the SQL text
   * @param {object|Error|Function} result  `{rows}`, an Error to reject with,
   *        or a function receiving (text, params) that returns either.
   * @param {{times?: number}} [opts] limit how many times this handler fires
   */
  when(pattern, result, opts = {}) {
    this.handlers.push({
      pattern,
      result,
      remaining: opts.times ?? Infinity,
    });
    return this;
  },

  reset() {
    this.calls = [];
    this.handlers = [];
    this.clients = [];
    this.lastPoolConfig = null;
  },

  /** SQL text of every recorded call, handy for coarse assertions. */
  get sql() {
    return this.calls.map((c) => c.text);
  },

  /** Calls whose SQL matches `pattern`. */
  matching(pattern) {
    const re = pattern instanceof RegExp ? pattern : new RegExp(escapeRe(pattern));
    return this.calls.filter((c) => re.test(c.text));
  },
};

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findHandler(text) {
  for (const h of db.handlers) {
    if (h.remaining <= 0) continue;
    const re = h.pattern instanceof RegExp ? h.pattern : new RegExp(escapeRe(h.pattern));
    if (re.test(text)) return h;
  }
  return null;
}

async function runQuery(text, params, source) {
  // pg accepts query({text, values}) as well as query(text, values).
  if (text && typeof text === 'object') {
    params = text.values;
    text = text.text;
  }
  db.calls.push({ text, params, source });

  const handler = findHandler(text);
  if (!handler) {
    // Unmatched queries succeed with no rows — the API's own code paths treat
    // that as "no data", which is what an empty table would do.
    return { rows: [], rowCount: 0 };
  }
  handler.remaining -= 1;

  let result = handler.result;
  if (typeof result === 'function') result = result(text, params);
  if (result instanceof Error) throw result;
  return { rowCount: result.rows ? result.rows.length : 0, ...result };
}

class FakeClient {
  constructor() {
    this.released = false;
  }
  query(text, params) {
    return runQuery(text, params, 'client');
  }
  release() {
    this.released = true;
  }
}

class Pool {
  constructor(config) {
    db.lastPoolConfig = config;
    this.options = config;
  }
  on() {
    return this;
  }
  query(text, params) {
    return runQuery(text, params, 'pool');
  }
  async connect() {
    const client = new FakeClient();
    db.clients.push(client);
    return client;
  }
  async end() {}
}

module.exports = { Pool, Client: FakeClient, db };
