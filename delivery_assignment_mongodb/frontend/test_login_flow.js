#!/usr/bin/env node
/* =============================================================================
   Delivery Assignment System — frontend login-flow test suite
   -----------------------------------------------------------------------------
   RUN:  node test_login_flow.js          (Node 16+, no npm install needed)

   This loads the REAL auth.js and executes its REAL functions (login,
   resolveExistingSession, guard, logout) against a mocked fetch that
   implements the same contract as the real Django backend:
     POST /api/auth/login/  -> {access, refresh, role, user_id, name}
     GET  /api/auth/me/     -> {id, username, role, ...} or 401

   It does NOT start Django (no network in this environment) — see
   backend/delivery/tests.py for the real database/assignment-engine tests,
   which need `python manage.py test` on a machine with Django installed.
   This file proves the piece Django tests can't: that the browser-side
   code takes you DIRECTLY from login.html to the right dashboard, blocks
   wrong-role access, and never shows a second login screen — using the
   actual shipped auth.js, not a re-implementation of it.
   ============================================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const DIR = __dirname;
const AUTH_JS = fs.readFileSync(path.join(DIR, 'auth.js'), 'utf8');

/* ------------------------------------------------------------------ reporting */
const tty = process.stdout.isTTY, col = (c, s) => tty ? `\x1b[${c}m${s}\x1b[0m` : s;
const R = { pass: 0, fail: 0, failures: [] };
let SEC = '', N = 0;
function check(name, cond, detail) {
  N++; const id = `${SEC}.${N}`;
  if (cond) { R.pass++; console.log(`  ${col(32, 'PASS')}  ${id.padEnd(5)} ${name}`); }
  else { R.fail++; R.failures.push(`${id} ${name}`); console.log(`  ${col(31, 'FAIL')}  ${id.padEnd(5)} ${name}${detail ? `\n               -> ${detail}` : ''}`); }
}
function section(num, title, fn) { SEC = num; N = 0; console.log('\n' + col('1;36', `[${num}] ${title}`)); return fn(); }

/* ------------------------------------------------------------------ mock backend */
// A tiny in-memory stand-in for the Django API, implementing the exact same
// request/response contract auth.js expects. Each test gets a fresh one.
function makeMockBackend(users) {
  // users: { username: { password, role, id, name } }
  const issuedTokens = new Map();  // access-token string -> username
  let tokenSeq = 0;
  return async function mockFetch(url, opts = {}) {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (path === '/api/auth/login/' && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      const u = users[body.username];
      if (!u || u.password !== body.password) return { ok: false, status: 401, json: async () => ({ detail: 'No active account found with the given credentials' }) };
      const access = 'tok_' + (tokenSeq++) + '_' + body.username;
      issuedTokens.set(access, body.username);
      return { ok: true, status: 200, json: async () => ({ access, refresh: 'refresh_' + access, role: u.role, user_id: u.id, name: u.name }) };
    }
    if (path === '/api/auth/me/') {
      const auth = (opts.headers || {}).Authorization || '';
      const token = auth.replace('Bearer ', '');
      const username = issuedTokens.get(token);
      if (!username) return { ok: false, status: 401, json: async () => ({ detail: 'Invalid token' }) };
      const u = users[username];
      return { ok: true, status: 200, json: async () => ({ id: u.id, username, role: u.role, first_name: u.name, last_name: '' }) };
    }
    return { ok: false, status: 404, json: async () => ({ detail: 'not found' }) };
  };
}
function revoke(mockFetch) { /* no-op placeholder kept for readability at call sites */ }

const USERS = {
  driver01:   { password: 'Driver@123',   role: 'driver',   id: 1, name: 'Driver One' },
  driver02:   { password: 'Driver@123',   role: 'driver',   id: 2, name: 'Driver Two' },
  customer001:{ password: 'Customer@123', role: 'customer', id: 3, name: 'Customer One' },
  manager1:   { password: 'Manager@123',  role: 'manager',  id: 4, name: 'Store Manager' },
};

/* ------------------------------------------------------------------ simulated tab */
// One "browser tab" = one sessionStorage + one location. auth.js is executed
// fresh in each tab's own VM context so DAS's internal state never leaks
// between tests (mirrors a real browser: sessionStorage is per-tab).
function makeTab(mockFetch) {
  const store = new Map();
  const sessionStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const redirects = [];
  const location = {
    search: '', pathname: '/x.html',
    replace(u) { redirects.push(String(u)); },
  };
  const sandbox = {
    window: {}, sessionStorage, location, fetch: mockFetch,
    URLSearchParams, console, history: { replaceState() {} },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(AUTH_JS, sandbox, { filename: 'auth.js' });
  return { ctx: sandbox, DAS: sandbox.DAS, redirects, location, store };
}
async function settle() { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); }

/* =============================================================================
   THE TESTS
   ============================================================================= */
(async () => {
  console.log(col('1', 'Delivery Assignment System — frontend login-flow tests'));
  console.log('Loaded real auth.js from: ' + path.join(DIR, 'auth.js'));

  /* ---------------------------------------------------------------- 1. DRIVER */
  section('1', 'Driver: valid login goes DIRECTLY to driver.html', async () => {
    const tab = makeTab(makeMockBackend(USERS));
    const result = await tab.DAS.login('driver01', 'Driver@123');
    check('login() succeeds and returns role=driver', result.ok && result.session.role === 'driver', JSON.stringify(result));
    check('session id matches the backend user id', result.session.id === USERS.driver01.id);
    const home = tab.DAS.ROLE_HOME[result.session.role];
    check('ROLE_HOME maps driver -> driver.html directly (this is what login.html redirects to)', home === 'driver.html', home);

    // Now simulate what login.html does after login(): guard() on the target page.
    const guardResult = await tab.DAS.guard('driver');
    check('driver.html\'s own guard("driver") accepts the session with NO redirect (no second login screen)', guardResult !== null && tab.redirects.length === 0, JSON.stringify(tab.redirects));
    check('guard() returns the driver\'s identity from the server (username driver01)', guardResult && guardResult.username === 'driver01');
  });

  await section('1b', 'Driver: wrong password rejected, no redirect, no session', async () => {
    const tab = makeTab(makeMockBackend(USERS));
    const result = await tab.DAS.login('driver01', 'not-the-password');
    check('login() fails with a clear error', result.ok === false && typeof result.error === 'string');
    check('no session was saved', tab.DAS.getSession() === null);
  });

  /* ---------------------------------------------------------------- 2. CUSTOMER */
  await section('2', 'Customer: valid login goes DIRECTLY to customer.html', async () => {
    const tab = makeTab(makeMockBackend(USERS));
    const result = await tab.DAS.login('customer001', 'Customer@123');
    check('login() succeeds and returns role=customer', result.ok && result.session.role === 'customer');
    check('ROLE_HOME maps customer -> customer.html directly', tab.DAS.ROLE_HOME[result.session.role] === 'customer.html');
    const guardResult = await tab.DAS.guard('customer');
    check('customer.html\'s own guard("customer") accepts the session with NO redirect', guardResult !== null && tab.redirects.length === 0);
  });

  /* ---------------------------------------------------------------- 3. MANAGER */
  await section('3', 'Manager: valid login goes DIRECTLY to manager.html', async () => {
    const tab = makeTab(makeMockBackend(USERS));
    const result = await tab.DAS.login('manager1', 'Manager@123');
    check('login() succeeds and returns role=manager', result.ok && result.session.role === 'manager');
    check('ROLE_HOME maps manager -> manager.html directly', tab.DAS.ROLE_HOME[result.session.role] === 'manager.html');
    const guardResult = await tab.DAS.guard('manager');
    check('manager.html\'s own guard("manager") accepts the session with NO redirect', guardResult !== null && tab.redirects.length === 0);
  });

  /* ---------------------------------------------------------------- 4. ALREADY LOGGED IN */
  await section('4', 'Already logged in: opening login.html skips the form entirely', async () => {
    for (const [username, u] of Object.entries(USERS)) {
      const tab = makeTab(makeMockBackend(USERS));
      await tab.DAS.login(username, u.password);
      const home = await tab.DAS.resolveExistingSession();  // this is what login.html calls on load
      check(`${u.role}: resolveExistingSession() resolves straight to ${tab.DAS.ROLE_HOME[u.role]} (login form never rendered)`, home === tab.DAS.ROLE_HOME[u.role], home);
    }
    // No session at all -> resolveExistingSession must return null so the form IS shown.
    const freshTab = makeTab(makeMockBackend(USERS));
    const home = await freshTab.DAS.resolveExistingSession();
    check('No session: resolveExistingSession() returns null (login form shown, as expected)', home === null);
  });

  /* ---------------------------------------------------------------- 5. ROLE PROTECTION */
  await section('5', "Role protection: a role cannot open another role's dashboard", async () => {
    const roleOf = { driver01: 'driver', customer001: 'customer', manager1: 'manager' };
    for (const [username, myRole] of Object.entries(roleOf)) {
      for (const otherRole of ['driver', 'customer', 'manager'].filter(r => r !== myRole)) {
        const tab = makeTab(makeMockBackend(USERS));
        await tab.DAS.login(username, USERS[username].password);
        const result = await tab.DAS.guard(otherRole);  // simulates opening the OTHER role's html file
        check(`${myRole} (${username}) opening the ${otherRole} dashboard: access DENIED (guard returns null)`, result === null);
        check(`${myRole} opening the ${otherRole} dashboard: redirected to own ${tab.DAS.ROLE_HOME[myRole]}?denied=1`, tab.redirects[0] === tab.DAS.ROLE_HOME[myRole] + '?denied=1', JSON.stringify(tab.redirects));
      }
    }
  });

  await section('5b', 'Not logged in: every dashboard sends you to login.html', async () => {
    for (const role of ['driver', 'customer', 'manager']) {
      const tab = makeTab(makeMockBackend(USERS));
      const result = await tab.DAS.guard(role);
      check(`not logged in: guard("${role}") denies access and redirects to login.html`, result === null && tab.redirects[0] === 'login.html', JSON.stringify(tab.redirects));
    }
  });

  await section('5c', 'Tampered / stale session is rejected (fail closed)', async () => {
    const tab = makeTab(makeMockBackend(USERS));
    await tab.DAS.login('driver01', 'Driver@123');
    // Forge a session with a token the mock backend never issued.
    tab.store.set('das_session', JSON.stringify({ access: 'forged-token', role: 'manager', id: 999 }));
    const result = await tab.DAS.guard('manager');
    check('forged/unknown token -> guard() denies access', result === null && tab.redirects[0] === 'login.html?reason=expired', JSON.stringify(tab.redirects));
    check('forged session is cleared from storage', tab.DAS.getSession() === null);
  });

  /* ---------------------------------------------------------------- 6. LOGOUT */
  await section('6', 'Logout: returns to login.html and clears the session', async () => {
    for (const [username, u] of Object.entries(USERS)) {
      const tab = makeTab(makeMockBackend(USERS));
      await tab.DAS.login(username, u.password);
      check(`${u.role}: session exists before logout`, tab.DAS.getSession() !== null);
      tab.DAS.logout();
      check(`${u.role}: logout redirects to login.html`, tab.redirects[tab.redirects.length - 1] === 'login.html?logout=1', JSON.stringify(tab.redirects));
      check(`${u.role}: session cleared from sessionStorage`, tab.DAS.getSession() === null && !tab.store.has('das_session'));
      const afterLogout = await tab.DAS.guard(u.role);
      check(`${u.role}: dashboard no longer reachable after logout (guard sends back to login.html)`, afterLogout === null && tab.redirects[tab.redirects.length - 1] === 'login.html', JSON.stringify(tab.redirects));
    }
  });

  /* ---------------------------------------------------------------- 7. FILE-LEVEL VERIFICATION */
  await section('7', 'File-level verification: exactly one login page, one guard per dashboard', async () => {
    const files = { 'login.html': fs.readFileSync(path.join(DIR, 'login.html'), 'utf8'),
                     'driver.html': fs.readFileSync(path.join(DIR, 'driver.html'), 'utf8'),
                     'customer.html': fs.readFileSync(path.join(DIR, 'customer.html'), 'utf8'),
                     'manager.html': fs.readFileSync(path.join(DIR, 'manager.html'), 'utf8') };
    // A "login form" is identified by its password field — dashboards are
    // allowed their own non-login forms (e.g. customer.html's order form).
    const withPassword = Object.entries(files).filter(([, s]) => /type=["']password["']/i.test(s)).map(([f]) => f);
    check('login.html is the ONLY file with a password field (i.e. the only login form)', withPassword.length === 1 && withPassword[0] === 'login.html', withPassword.join(', '));
    for (const [f, role] of [['driver.html', 'driver'], ['customer.html', 'customer'], ['manager.html', 'manager']]) {
      check(`${f}: no "authScreen" / login UI of its own`, !/authScreen/i.test(files[f]) && !/driver login|customer login|manager login/i.test(files[f]));
      check(`${f}: no password field (no login form present)`, !/type=["']password["']/i.test(files[f]));
      check(`${f}: calls DAS.guard("${role}")`, files[f].includes(`DAS.guard("${role}")`));
      const others = ['driver', 'customer', 'manager'].filter(r => r !== role);
      check(`${f}: does not also guard as another role`, others.every(r => !files[f].includes(`DAS.guard("${r}")`)));
    }
    const authJs = fs.readFileSync(path.join(DIR, 'auth.js'), 'utf8');
    check('auth.js maps every role to its dashboard file', /driver:\s*"driver\.html"/.test(authJs) && /customer:\s*"customer\.html"/.test(authJs) && /manager:\s*"manager\.html"/.test(authJs));
    // Confirms login.html's own init script — not just the underlying auth.js
    // function — actually calls resolveExistingSession() and redirects on it.
    check('login.html itself calls DAS.resolveExistingSession() and redirects when a session exists',
      /resolveExistingSession\(\)/.test(files['login.html']) && /location\.replace\(home\)/.test(files['login.html']));
    check('login.html\'s submit handler redirects using the server-returned role (DAS.ROLE_HOME[result.session.role])',
      /location\.replace\(DAS\.ROLE_HOME\[result\.session\.role\]\)/.test(files['login.html']));
  });

  /* ---------------------------------------------------------------- summary */
  const total = R.pass + R.fail;
  console.log('\n' + '='.repeat(72));
  console.log(` RESULT:  ${col(32, R.pass + ' passed')},  ${R.fail ? col(31, R.fail + ' failed') : '0 failed'}   (${total} checks)`);
  if (R.fail) { console.log('\n Failed checks:'); R.failures.forEach(f => console.log('   - ' + f)); }
  console.log(' NOTE: this suite tests the browser-side login/redirect/guard logic against a');
  console.log(' mocked backend. Run `python manage.py test` in backend/ for the real database,');
  console.log(' authentication and order-assignment-engine tests (busy driver, waiting queue,');
  console.log(' one-order-one-driver, etc.) — see backend/delivery/tests.py.');
  console.log('='.repeat(72));
  process.exit(R.fail ? 1 : 0);
})();
