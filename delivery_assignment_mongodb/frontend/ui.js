/* Small shared helpers for the three dashboards (Bootstrap 5 markup). */
const UI = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const COLORS = { pending:"warning", assigned:"primary", delivered:"success", cancelled:"secondary", available:"success", busy:"danger" };
  const badge = s => `<span class="badge rounded-pill text-bg-${COLORS[s] || "secondary"}">${esc(s)}</span>`;
  const fmt = d => d ? new Date(d).toLocaleString() : "—";
  function toast(msg, kind) {
    const host = document.getElementById("toastHost");
    const el = document.createElement("div");
    el.className = "toast show align-items-center text-bg-" + ({error:"danger"}[kind] || kind || "info") + " border-0";
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div></div>`;
    host.appendChild(el); setTimeout(() => el.remove(), 3500);
  }
  async function api(path, opts) {
    const res = await fetch(DAS.API_BASE + path, { ...opts, headers: { ...(opts && opts.headers), ...DAS.authHeader(), "Content-Type": "application/json" } });
    if (res.status === 401) { DAS.logout(); throw new Error("session expired"); }
    return res;
  }
  const navbar = (title) => `<nav class="navbar navbar-dark app-nav"><div class="container">
    <span class="navbar-brand">${title}</span>
    <div class="d-flex align-items-center gap-3"><span class="text-white-50 small d-none d-sm-inline" id="whoLabel"></span>
    <button class="btn btn-outline-light btn-sm" id="logoutBtn">Log out</button></div></div></nav>`;
  const stat = (label, id, note) => `<div class="col"><div class="card stat-card h-100"><div class="card-body">
    <div class="stat-label">${label}</div><div class="stat-value" id="${id}">–</div>${note ? `<div class="stat-note">${note}</div>` : ""}</div></div></div>`;
  return { esc, badge, fmt, toast, api, navbar, stat };
})();
