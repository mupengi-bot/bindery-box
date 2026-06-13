// BINDERY BOX · Control Room client.
// Renders a 3-pane workspace (org / board / inspector) plus a Live Operations
// Log dock that streams runtime + agent + audit + office activity. The live
// log auto-refreshes every 2.5s so agent invocations show up as they happen,
// even against the stateless cloud demo.

// ── API base resolution ───────────────────────────────────────────────
//   1. window.__BINDERY_API_BASE__  (env-injected config.js — cloud deploys)
//   2. window.BINDERY_API_URL       (legacy override)
//   3. same-origin "" on a real host (Vercel) · localhost:4311 locally
function resolveApiBase() {
  if (typeof window.__BINDERY_API_BASE__ === "string") return window.__BINDERY_API_BASE__;
  if (typeof window.BINDERY_API_URL === "string") return window.BINDERY_API_URL;
  const host = window.location && window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") return "";
  return "http://localhost:4311";
}

const api = resolveApiBase();
const workspace = window.BINDERY_WORKSPACE || "default";
const $ = (id) => document.getElementById(id);
const LIVE_INTERVAL_MS = 2500;

// Client-side view state.
const view = {
  overview: null,
  connectors: null,
  knowledge: null,
  live: null,
  search: "",
  liveFilter: "all",
  autoLive: true
};
let liveTimer = null;

// ── helpers ────────────────────────────────────────────────────────────
async function request(path, options = {}) {
  const res = await fetch(`${api}${path}`, options);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function hueColor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 42% 58%)`;
}
function fmtTime(iso) {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("en-GB", { hour12: false });
}
const STATUS_LABEL = {
  queued: "Queued", running: "Running",
  waiting_approval: "Waiting Approval", completed: "Completed", failed: "Failed"
};
function setConn(ok, label) {
  const el = $("conn-state");
  el.classList.toggle("ok", ok);
  el.classList.toggle("err", !ok);
  $("conn-label").textContent = label;
}
function matchesSearch(text) {
  const q = view.search.trim().toLowerCase();
  if (!q) return true;
  return String(text).toLowerCase().includes(q);
}

// ── renderers ──────────────────────────────────────────────────────────
function renderOrg(ov) {
  const tenant = ov.tenant || {};
  const ws = ov.workspace || {};
  $("org-name").textContent = tenant.name || "Workspace";
  $("org-edition").textContent = `${tenant.edition || ws.editionId || "platform"} edition`;
  $("org-avatar").textContent = initials(tenant.name || "BB");
  $("brand-sub").textContent = `${ws.name || "Workspace"} Control Room`;

  const workspaces = ov.workspaces || (ov.workspace ? [ov.workspace] : []);
  $("ws-list").innerHTML = workspaces.map((w) => `
    <div class="ws-item ${w.slug === ws.slug ? "active" : ""}">
      <span class="ws-dot"></span><span>${esc(w.name || w.slug)}</span>
    </div>`).join("") || `<div class="muted">워크스페이스 없음</div>`;
}

function renderAgents(agents) {
  const list = agents.filter((a) =>
    matchesSearch(`${a.name} ${a.role} ${a.channel} ${(a.capabilities || []).join(" ")}`));
  $("agent-count").textContent = String(agents.length);
  $("agents").innerHTML = list.length ? list.map((a) => {
    const st = a.status || "idle";
    return `
    <article class="agent-card">
      <div class="agent-top">
        <div class="agent-avatar" style="background:${hueColor(a.id || a.name)}">${esc(initials(a.name))}</div>
        <div class="agent-id">
          <span class="nm">${esc(a.name)}</span>
          <span class="rl">${esc(a.role || "")}</span>
        </div>
        <span class="agent-status s-${esc(st)}"><span class="s-dot"></span>${esc(st)}</span>
      </div>
      <div class="agent-kpi"><span class="kpi-tag">KPI</span><span>${esc(a.kpi || "—")}</span></div>
      <div class="agent-channel">${esc(a.channel || "")}</div>
      <div class="chips">${(a.capabilities || []).map((c) => `<span class="chip cap">${esc(c)}</span>`).join("")}</div>
    </article>`;
  }).join("") : `<div class="muted">검색 결과 없음</div>`;
}

function renderConnectors(payload) {
  const connectors = payload?.connectors || [];
  $("connector-count").textContent = String(connectors.length);
  $("connectors").innerHTML = connectors.map((c) => `
    <span class="connector-pill" title="${esc((c.capabilities || []).join(', '))}">
      <span>${esc(c.name)}</span><span class="cat">${esc(c.category)}</span>
    </span>`).join("");
}

function renderBoard(ov) {
  const m = ov.metrics || {};
  $("kpi-strip").innerHTML = [
    ["Active", m.activeAgents ?? 0, "agents"],
    ["Queued", m.queuedTasks ?? 0, "tasks"],
    ["Approvals", m.pendingApprovals ?? 0, "pending"],
    ["Done", m.completedTasks ?? 0, "completed"]
  ].map(([l, v]) => `<div class="kpi"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join("");

  const order = ["queued", "running", "waiting_approval", "completed", "failed"];
  const tasks = ov.tasks || [];
  const byStatus = (s) => tasks.filter((t) => (t.status || "queued") === s);

  const flow = [
    ["queued", "Queued", byStatus("queued").length],
    ["running", "Running", byStatus("running").length],
    ["waiting", "Waiting", byStatus("waiting_approval").length],
    ["completed", "Completed", byStatus("completed").length]
  ];
  $("flow-rail").innerHTML = flow.map(([cls, label, n], i) => `
    <div class="flow-step ${cls}"><span class="fc">${n}</span><span class="fl">${label}</span></div>
    ${i < flow.length - 1 ? '<span class="flow-arrow">→</span>' : ""}`).join("");

  const visible = tasks.filter((t) =>
    matchesSearch(`${t.title} ${t.category} ${t.source} ${t.output || ""}`));
  const lanes = order
    .filter((s) => byStatus(s).length > 0)
    .map((status) => {
      const items = visible.filter((t) => (t.status || "queued") === status);
      const cards = items.length ? items.map(taskCard).join("")
        : `<div class="lane-empty">표시할 업무가 없습니다.</div>`;
      return `
      <section class="lane" data-status="${status}">
        <header class="lane-head">
          <span class="lane-bar"></span>
          <h4>${STATUS_LABEL[status] || status}</h4>
          <span class="lane-n">${byStatus(status).length}</span>
        </header>
        <div class="lane-body">${cards}</div>
      </section>`;
    }).join("");
  $("lanes").innerHTML = lanes || `<div class="muted">업무가 없습니다. 상단 Seed로 데모 데이터를 생성하세요.</div>`;

  document.querySelectorAll("[data-run]").forEach((btn) =>
    btn.addEventListener("click", () => runTask(btn.dataset.run)));
}

function taskCard(t) {
  const status = t.status || "queued";
  const done = status === "completed" || status === "failed";
  const prio = (t.priority || "normal") === "high" ? "prio-high" : "";
  return `
  <article class="task-card">
    <div class="t-top">
      <h5>${esc(t.title)}</h5>
      <span class="status-pill ${status}">${status.replace("_", " ")}</span>
    </div>
    <div class="task-meta">
      <span class="task-tag">${esc(t.category || "task")}</span>
      <span class="task-tag ${prio}">${esc(t.priority || "normal")}</span>
      ${t.requiresApproval ? '<span class="task-tag">approval</span>' : ""}
    </div>
    ${t.output ? `<div class="task-out">${esc(t.output)}</div>` : ""}
    <button class="run-btn" data-run="${esc(t.id)}" ${done ? "disabled" : ""}>
      ${status === "running" ? "Running…" : status === "waiting_approval" ? "Awaiting Approval" : "▶ Run Task"}
    </button>
  </article>`;
}

function renderApprovals(approvals) {
  const pending = approvals.filter((a) => a.status === "pending").length;
  $("approval-badge").textContent = String(pending);
  $("approvals").innerHTML = approvals.length ? approvals.map((a) => {
    const pend = a.status === "pending";
    return `
    <div class="approval-item ${pend ? "" : "done"}">
      <div class="a-top">
        <h5>${esc(a.title)}</h5>
        <span class="status-pill ${pend ? "waiting_approval" : a.status === "approved" ? "completed" : "failed"}">${esc(a.status)}</span>
      </div>
      <p>${esc(a.summary || a.reason || "")}</p>
      <div class="approval-actions">
        <button class="approve-btn" data-approve="${esc(a.id)}" ${pend ? "" : "disabled"}>✓ Approve</button>
        <button class="reject-btn" data-reject="${esc(a.id)}" ${pend ? "" : "disabled"}>✕ Reject</button>
      </div>
    </div>`;
  }).join("") : `<div class="muted">대기 중인 승인이 없습니다.</div>`;

  document.querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", () => decide(b.dataset.approve, "approved")));
  document.querySelectorAll("[data-reject]").forEach((b) =>
    b.addEventListener("click", () => decide(b.dataset.reject, "rejected")));
}

function renderKnowledge(kb, hitIds) {
  const nodes = kb.nodes || [];
  const edges = kb.edges || [];
  $("knowledge-badge").textContent = String(nodes.length);
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const hits = hitIds || new Set();

  // mini graph: place nodes on a circle, draw edges.
  const W = 320, H = 152, cx = W / 2, cy = H / 2, r = 56;
  const pos = {};
  nodes.forEach((n, i) => {
    const ang = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    pos[n.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  });
  const edgeSvg = edges.map((e) => {
    const a = pos[e.fromId], b = pos[e.toId];
    if (!a || !b) return "";
    return `<line class="g-edge" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" />`;
  }).join("");
  const nodeSvg = nodes.map((n) => {
    const p = pos[n.id];
    const fill = hueColor(n.nodeType || n.title);
    const hot = hits.has(n.id);
    const short = (n.title || "").length > 11 ? n.title.slice(0, 10) + "…" : n.title;
    return `<g class="g-node">
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${hot ? 7 : 5}"
        fill="${fill}" stroke="${hot ? "#e0a35c" : "rgba(255,255,255,.25)"}" />
      <text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" text-anchor="middle">${esc(short)}</text>
    </g>`;
  }).join("");
  $("graph-mini").innerHTML = nodes.length
    ? `<svg viewBox="0 0 ${W} ${H}">${edgeSvg}${nodeSvg}</svg>`
    : "";

  $("knowledge").innerHTML = edges.length ? edges.map((e) => {
    const from = nodeById[e.fromId], to = nodeById[e.toId];
    const hot = from && to && (hits.has(from.id) || hits.has(to.id));
    return `<div class="relation ${hot ? "hit" : ""}">
      <span class="r-from">${esc(from?.title || "?")}</span>
      <span class="r-rel">${esc(e.relation)}</span>
      <span class="r-to">${esc(to?.title || "?")}</span>
    </div>`;
  }).join("") : `<div class="muted">관계 데이터가 없습니다.</div>`;
}

function renderOffice(events) {
  $("office").innerHTML = events.length ? events.map((p) => `
    <div class="office-post">
      <div class="op-head">
        <span class="op-ch">${esc(p.channelRef)}</span>
        <span class="op-prov">${esc(p.provider)}</span>
      </div>
      <div class="op-text">${esc(p.text)}</div>
    </div>`).join("") : `<div class="muted">오피스 활동이 아직 없습니다.</div>`;
}

function renderLive(live) {
  const counts = live.counts || {};
  $("live-meta").textContent =
    `${live.returned ?? (live.entries || []).length} entries · updated ${fmtTime(live.generatedAt)}`;
  $("live-filters").querySelectorAll(".lf").forEach((b) => {
    const src = b.dataset.src;
    const n = src === "all" ? (live.returned ?? 0) : (counts[src] ?? 0);
    b.textContent = src === "all" ? `all` : `${src} ${n}`;
    b.classList.toggle("active", view.liveFilter === src);
  });

  const entries = (live.entries || [])
    .filter((e) => view.liveFilter === "all" || e.source === view.liveFilter)
    .filter((e) => matchesSearch(`${e.actor} ${e.message} ${e.action} ${e.channel || ""}`));

  $("live-log").innerHTML = entries.length ? entries.map((e) => `
    <div class="log-row">
      <span class="l-ts">${fmtTime(e.ts)}</span>
      <span class="l-src ${esc(e.source)}">${esc(e.source)}</span>
      <span class="l-actor">${esc(e.actor)}</span>
      <span class="l-msg"><span class="l-lvl ${esc(e.level)}"></span>
        ${e.channel ? `<span class="l-ch">${esc(e.channel)}</span>` : ""}
        <span>${esc(e.message)}</span></span>
    </div>`).join("") : `<div class="log-empty">표시할 로그가 없습니다.</div>`;
}

// ── data loads ──────────────────────────────────────────────────────────
async function loadOverview() {
  const ov = await request(`/api/workspaces/${workspace}/overview`);
  view.overview = ov;
  setConn(true, "connected");
  renderOrg(ov);
  renderAgents(ov.agents || []);
  renderBoard(ov);
  renderApprovals(ov.approvals || []);
  renderOffice(ov.officeEvents || []);
}

async function loadConnectors() {
  view.connectors = await request(`/api/connectors`);
  renderConnectors(view.connectors);
}

async function loadKnowledge(hitIds) {
  view.knowledge = await request(`/api/knowledge`);
  renderKnowledge(view.knowledge, hitIds);
}

async function loadLive() {
  try {
    view.live = await request(`/api/workspaces/${workspace}/live-log`);
    renderLive(view.live);
  } catch (err) {
    $("live-meta").textContent = "live-log 연결 실패";
  }
}

async function loadAll() {
  try {
    await Promise.all([loadOverview(), loadConnectors(), loadKnowledge(), loadLive()]);
  } catch (err) {
    setConn(false, "disconnected");
    $("lanes").innerHTML = `<div class="error-line">API 연결 실패: ${esc(err.message)}</div>`;
  }
}

// ── actions ─────────────────────────────────────────────────────────────
async function runTask(taskId) {
  try {
    await request(`/api/tasks/${taskId}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestedBy: "control-room" })
    });
  } catch (err) { setConn(false, "run failed"); }
  await loadOverview();
  await loadLive(); // log should visibly grow right after the run
}

async function decide(approvalId, decision) {
  try {
    await request(`/api/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, decidedBy: "control-room" })
    });
  } catch (err) { setConn(false, "decision failed"); }
  await loadOverview();
  await loadLive();
}

async function runSearch() {
  // re-render local views with the current filter…
  if (view.overview) {
    renderAgents(view.overview.agents || []);
    renderBoard(view.overview);
  }
  // …and surface knowledge graph hits for the query.
  const q = view.search.trim();
  let hitIds = new Set();
  if (q && view.knowledge) {
    try {
      const res = await request(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
      hitIds = new Set((res.results || []).map((r) => r.id));
    } catch { /* keep graph as-is on search error */ }
    renderKnowledge(view.knowledge, hitIds);
  } else if (view.knowledge) {
    renderKnowledge(view.knowledge, hitIds);
  }
  if (view.live) renderLive(view.live);
}

// ── live auto-refresh loop ───────────────────────────────────────────────
function startLiveTimer() {
  stopLiveTimer();
  if (!view.autoLive) return;
  liveTimer = setInterval(loadLive, LIVE_INTERVAL_MS);
}
function stopLiveTimer() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}
function setAuto(on) {
  view.autoLive = on;
  $("auto-toggle").classList.toggle("active", on);
  $("auto-label").textContent = on ? "Auto 2.5s" : "Paused";
  $("live-pulse").classList.toggle("paused", !on);
  startLiveTimer();
}

// ── wiring ───────────────────────────────────────────────────────────────
$("refresh").addEventListener("click", loadAll);
$("seed").addEventListener("click", async () => {
  try {
    await request(`/api/demo/seed`, { method: "POST" });
  } catch (err) { setConn(false, "seed failed"); }
  await loadAll();
});
$("live-refresh").addEventListener("click", loadLive);
$("auto-toggle").addEventListener("click", () => setAuto(!view.autoLive));

$("live-filters").querySelectorAll(".lf").forEach((b) =>
  b.addEventListener("click", () => {
    view.liveFilter = b.dataset.src;
    if (view.live) renderLive(view.live);
  }));

let searchTimer = null;
$("search").addEventListener("input", (e) => {
  view.search = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 180);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("search")) {
    e.preventDefault(); $("search").focus();
  }
});

// Pause polling when the tab is hidden; resume on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopLiveTimer();
  else if (view.autoLive) { loadLive(); startLiveTimer(); }
});

// boot
loadAll();
startLiveTimer();
