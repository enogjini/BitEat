/**
 * API client and session store.
 *
 * Every call carries the bearer token from `POST /api/login`. The token and
 * user live in localStorage under `biteat-session` so a reload keeps you
 * signed in; a 401 from the server clears them and fires `biteat:logout`,
 * which App listens for to drop back to the login page.
 */

const API_BASE = process.env.REACT_APP_API_URL || '';
const SESSION_KEY = 'biteat-session';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.token || !session.user) return null;
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession({ token, user, expires_in }) {
  const session = {
    token,
    user,
    expiresAt: expires_in ? Date.now() + expires_in * 1000 : null,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode or full storage — the in-memory state still works */
  }
  return session;
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

function currentToken() {
  const session = loadSession();
  return session ? session.token : null;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function handleResponse(res, path) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status === 401 && path !== '/api/login') {
    clearSession();
    window.dispatchEvent(new Event('biteat:logout'));
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) || `Gabim ${res.status}`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = currentToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse(res, path);
}

/**
 * POST a `FormData` body (a file upload). Deliberately skips the JSON
 * `Content-Type`/`stringify` that `request` always applies — the browser
 * must set its own multipart boundary on the header itself.
 */
async function upload(path, formData) {
  const headers = {};
  const token = currentToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  return handleResponse(res, path);
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => upload(path, formData),

  /**
   * Sign in and persist the session. Resolves with the user, or throws an
   * ApiError whose message is the server's reason.
   */
  async login(credentials) {
    const data = await request('POST', '/api/login', credentials);
    if (!data || !data.success) {
      throw new ApiError((data && data.message) || 'Gabim!', 401, data);
    }
    saveSession(data);
    return data.user;
  },

  logout() {
    clearSession();
  },
};

export default api;
