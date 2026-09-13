'use strict';

const { before, after, beforeEach } = require('node:test');
const { startServer, db, fakeOcr } = require('./app');

/**
 * Boot the API once per test file and hand back a live context.
 * Query history is cleared before every test so assertions on `db.calls`
 * only ever see the request under test.
 *
 * @param {object} [env] process.env overrides applied while the module loads
 * @returns {{request: Function, url: string, app: any}} populated by `before`
 */
function useServer(env = {}) {
  const ctx = {
    request: (...args) => ctx._request(...args),
  };

  before(async () => {
    const server = await startServer(env);
    ctx._request = server.request;
    ctx.url = server.url;
    ctx.app = server.app;
    ctx._close = server.close;
  });

  beforeEach(() => {
    db.reset();
    fakeOcr.reset();
  });

  after(async () => {
    if (ctx._close) await ctx._close();
  });

  return ctx;
}

module.exports = { useServer, db, fakeOcr };
