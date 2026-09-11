'use strict';

/**
 * Loads api/index.js with the `pg` module swapped for the fake in fake-pg.js,
 * and serves it on an ephemeral port so tests can drive it over real HTTP.
 *
 * api/index.js builds its Pool at module scope, so the swap has to happen
 * before the module is first required — hence the Module._load hook rather
 * than a plain assignment.
 */

const http = require('node:http');
const Module = require('node:module');

const { db } = require('./fake-pg');

const API_PATH = require.resolve('../../api/index.js');
const FAKE_PG_PATH = require.resolve('./fake-pg.js');

let hooked = false;
function hookPg() {
  if (hooked) return;
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'pg') return load.call(this, FAKE_PG_PATH, ...rest);
    return load.call(this, request, ...rest);
  };
  hooked = true;
}

/**
 * Require a fresh copy of the Express app.
 * @param {object} env values to set on process.env before the module loads
 */
function loadApp(env = {}) {
  hookPg();
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[API_PATH];
  try {
    return require(API_PATH);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * Start the API on a random free port.
 * @returns {Promise<{url: string, request: Function, close: Function, app: any}>}
 */
async function startServer(env = {}) {
  const app = loadApp(env);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;

  /**
   * @param {string} method
   * @param {string} path
   * @param {object} [options] `{ body, timeoutMs }`
   */
  async function request(method, path, options = {}) {
    const { body, timeoutMs = 3000 } = options;
    const res = await fetch(url + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let parsed = text;
    try {
      parsed = text === '' ? null : JSON.parse(text);
    } catch {
      /* leave as text — a non-JSON body is itself worth asserting on */
    }
    return { status: res.status, body: parsed, text, headers: res.headers };
  }

  return {
    url,
    app,
    request,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startServer, loadApp, db };
