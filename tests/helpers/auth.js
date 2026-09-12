'use strict';

/**
 * Tokens for the test suite, minted with the same code and dev secret the API
 * verifies with (JWT_SECRET is unset while tests run).
 */

const auth = require('../../lib/auth');

const USERS = {
  admin: { punonjes_id: 99, emri: 'admin', lloji: 'admin' },
  menaxher: { punonjes_id: 5, emri: 'Ilir', lloji: 'menaxher' },
  kamarier: { punonjes_id: 1, emri: 'Arben', lloji: 'kamarier' },
};

/**
 * @param {string|object} who a role name from USERS, or a user object with
 *        `punonjes_id`, `emri`, `lloji`
 * @param {object} [opts] `{ ttl }` seconds until expiry (negative = expired)
 */
function tokenFor(who, opts = {}) {
  const user = typeof who === 'string' ? USERS[who] : who;
  if (!user) throw new Error(`unknown test user: ${who}`);
  return auth.signToken(
    { sub: user.punonjes_id, emri: user.emri, lloji: user.lloji },
    auth.getSecret(),
    opts.ttl
  );
}

function authHeader(who, opts) {
  return { Authorization: `Bearer ${tokenFor(who, opts)}` };
}

module.exports = { USERS, tokenFor, authHeader };
