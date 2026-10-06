/* =============================================================================
   Delivery Assignment System — shared frontend auth module
   Loaded by: login.html (the ONE login page) and driver.html / customer.html /
   manager.html (each calls DAS.guard("<its role>") before showing anything).

   Talks to the real backend:
     POST /api/auth/login/   -> {access, refresh, role, user_id, name}
     GET  /api/auth/me/      -> {id, username, role, first_name, last_name}
   The role always comes from the server (the JWT payload AND a live re-check
   via /me/) — the frontend never lets the user pick or override it.

   API_BASE is separated out so this file works unmodified whether the
   frontend is opened via a local static server or served by the same host
   as the API — set window.DAS_API_BASE before this script loads to override.
   ============================================================================= */
const DAS = (() => {
  // When Django serves this frontend (http://127.0.0.1:8000/app/...), call the API on the
  // same origin (no CORS, no port juggling). Otherwise fall back to the dev backend URL.
  // window.DAS_API_BASE (set before this script loads) overrides both.
  const SERVED_BY_BACKEND = typeof location !== "undefined" && typeof location.pathname === "string"
    && location.pathname.indexOf("/app/") === 0;
  const API_BASE = (typeof window !== "undefined" && window.DAS_API_BASE)
    || (SERVED_BY_BACKEND ? "" : "http://127.0.0.1:8000");
  const SESSION_KEY = "das_session";           // { access, refresh, role, id, name, expiresAt }
  const LOGIN_PAGE = "login.html";
  const ROLE_HOME = { customer: "customer.html", driver: "driver.html", manager: "manager.html" };

  /* ---------------- session storage (tab-scoped; cleared when the tab closes) --- */
  function saveSession(session) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
    catch (e) { console.error("Could not save session", e); }
  }
  function getSession() {
    let raw;
    try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s || !s.access || !s.role) return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* ---------------- API calls (fetchImpl is injectable for testing) ------------- */
  async function apiLogin(username, password, fetchImpl) {
    const f = fetchImpl || fetch;
    let res;
    try {
      res = await f(API_BASE + "/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch (e) {
      return { ok: false, error: "Could not reach the server. Is the backend running?" };
    }
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? "Invalid ID/username or password." : "Login failed (server error)." };
    }
    const data = await res.json();
    return {
      ok: true,
      session: { access: data.access, refresh: data.refresh, role: data.role, id: data.user_id, name: data.name },
    };
  }

  async function apiMe(access, fetchImpl) {
    const f = fetchImpl || fetch;
    let res;
    try {
      res = await f(API_BASE + "/api/auth/me/", { headers: { Authorization: "Bearer " + access } });
    } catch (e) {
      return { ok: false, networkError: true };
    }
    if (!res.ok) return { ok: false, networkError: false };
    return { ok: true, data: await res.json() };
  }

  /* ---------------- public: login page -------------------------------------- */
  async function login(username, password, fetchImpl) {
    const result = await apiLogin(username, password, fetchImpl);
    if (!result.ok) return result;
    saveSession(result.session);
    return result;
  }

  /* If a valid session already exists, resolve its home page (re-verified
     against the server) — used so login.html never shows the form to an
     already-authenticated user. Returns null if there's no usable session. */
  async function resolveExistingSession(fetchImpl) {
    const s = getSession();
    if (!s) return null;
    const me = await apiMe(s.access, fetchImpl);
    if (!me.ok) {
      if (!me.networkError) clearSession();   // token invalid/expired -> drop it
      return null;
    }
    if (me.data.role !== s.role) clearSession();  // role changed server-side -> force re-login
    return ROLE_HOME[me.data.role] || null;
  }

  /* ---------------- public: dashboard route guard ---------------------------- */
  /* Call first thing on every dashboard page. Returns the verified user object
     on success; on failure it redirects and returns null — the caller must
     stop (the dashboard's own content must never render in that case). */
  async function guard(requiredRole, fetchImpl, loc) {
    const location_ = loc || (typeof window !== "undefined" ? window.location : null);
    const s = getSession();
    if (!s) { location_.replace(LOGIN_PAGE); return null; }

    const me = await apiMe(s.access, fetchImpl);
    if (!me.ok) {
      if (!me.networkError) { clearSession(); location_.replace(LOGIN_PAGE + "?reason=expired"); return null; }
      // Network error while backend is unreachable: fail closed, do not show the page.
      location_.replace(LOGIN_PAGE + "?reason=network");
      return null;
    }
    if (me.data.role !== requiredRole) {
      const home = ROLE_HOME[me.data.role];
      location_.replace((home || LOGIN_PAGE) + (home ? "?denied=1" : ""));
      return null;
    }
    return me.data;
  }

  function consumeDeniedFlag(loc) {
    const location_ = loc || window.location;
    const q = new URLSearchParams(location_.search);
    if (!q.has("denied")) return false;
    try { history.replaceState(null, "", location_.pathname); } catch (e) {}
    return true;
  }

  function authHeader() {
    const s = getSession();
    return s ? { Authorization: "Bearer " + s.access } : {};
  }

  function logout(loc) {
    const location_ = loc || window.location;
    clearSession();
    location_.replace(LOGIN_PAGE + "?logout=1");
  }

  /* Browser Back/Forward cache can re-show a dashboard after logout without re-running
     scripts. On a restored page with no session, send the user to the one login page. */
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("pageshow", (e) => {
      const onLogin = window.location.pathname.endsWith(LOGIN_PAGE);
      if (e.persisted && !onLogin && !getSession()) window.location.replace(LOGIN_PAGE);
    });
  }

  return {
    API_BASE, ROLE_HOME, LOGIN_PAGE,
    login, resolveExistingSession, guard, consumeDeniedFlag, logout,
    authHeader, getSession, clearSession,           // exposed for dashboards + tests
    _internal: { apiLogin, apiMe, saveSession },     // exposed for the test suite only
  };
})();

// Top-level `const` never becomes a property of the global object (true in
// real browsers too), so expose it explicitly for anything that reads
// `window.DAS` / `global.DAS` instead of relying on lexical scope alone.
if (typeof window !== "undefined") window.DAS = DAS;
if (typeof module !== "undefined" && module.exports) module.exports = DAS;

