// BINDERY BOX · Company Simulator client.
// Renders a 3-pane cockpit (company map / operations stream / mission inspector)
// driven by the workstream projection — a human-facing "AI company" view with
// gamified vitals, mission cards, narrative beats, objectives, achievements and
// mini topology/knowledge maps. A demoted Debug drawer streams the raw live log
// (runtime + agent + audit + office) and auto-refreshes every 2.5s so agent
// invocations show up as they happen, even against the stateless cloud demo.
//
// Data sources (all existing endpoints, no external deps):
//   GET /api/workspaces/:id/workstream   — primary simulator surface
//   GET /api/workspaces/:id/overview      — fallback + connection probe
//   GET /api/workspaces/:id/live-log      — raw technical log (debug drawer)
//   GET /api/connectors                   — connector hub count
//   GET /api/knowledge                    — knowledge graph nodes/edges
//   GET /api/knowledge/search?q=          — search hit highlighting
//   POST /api/tasks/:id/run               — run a mission
//   POST /api/approvals/:id/decision      — approve / reject
//   POST /api/demo/seed                   — reseed demo company

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
  ws: null,          // workstream projection (or synthesized fallback)
  connectors: null,
  knowledge: null,
  live: null,
  hits: new Set(),   // knowledge search hit ids
  search: "",
  liveFilter: "all",
  autoLive: true
};
let liveTimer = null;
let searchTimer = null;

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
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function trendArrow(t) { return t === "up" ? "▲" : t === "down" ? "▼" : "·"; }

const LANE_STATUS_COLOR = {
  running: "#6ba6df", success: "#74c489", error: "#e0775c", idle: "rgba(236,224,204,.4)", info: "#8e8470"
};
const RUN_LABEL = {
  queued: "▶ 실행", running: "실행 중…", waiting_approval: "승인 대기",
  completed: "완료", failed: "재실행"
};

function setConn(ok, label) {
  const el = $("conn");
  if (el) { el.classList.toggle("ok", ok); el.classList.toggle("err", !ok); }
  const lbl = $("conn-label");
  if (lbl) lbl.textContent = label;
}
function matchesSearch(text) {
  const q = view.search.trim().toLowerCase();
  if (!q) return true;
  return String(text).toLowerCase().includes(q);
}

// Build an SVG sparkline (line + fill) from a numeric series.
function sparkSvg(series, w = 100, h = 26) {
  const s = (series && series.length) ? series : [0, 0];
  const n = s.length, max = Math.max(...s, 1), pad = 2;
  const pts = s.map((v, i) => {
    const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const fill = `${line} L ${w} ${h} L 0 ${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path class="sp-fill" d="${fill}"/><path class="sp-line" d="${line}"/></svg>`;
}

// ── renderers ──────────────────────────────────────────────────────────
function renderVitals(ws) {
  const c = ws.company || {};
  const health = clamp(Math.round(c.healthScore ?? 0), 0, 100);
  const R = 42, C = 2 * Math.PI * R;
  const offset = C * (1 - health / 100);
  const ringColor = health >= 70 ? "var(--green)" : health >= 40 ? "var(--copper)" : "var(--red)";
  const delta = c.healthDelta ?? 0;
  const dCls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const automation = clamp(Math.round(c.automationLevel ?? 0), 0, 100);
  const activeAgents = c.activeAgents ?? (ws.agents || []).length;
  const agentPct = clamp(Math.round((activeAgents / Math.max(1, (ws.agents || []).length)) * 100), 0, 100);

  $("vitals").innerHTML = `
    <div class="vit-top">
      <div class="health-ring">
        <svg viewBox="0 0 96 96">
          <circle class="ring-track" cx="48" cy="48" r="${R}"></circle>
          <circle class="ring-val" cx="48" cy="48" r="${R}" stroke="${ringColor}"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle>
        </svg>
        <div class="health-center"><b>${health}</b><span>Health</span></div>
      </div>
      <div class="vit-meta">
        <div class="vit-name">${esc(c.name || "Company")}</div>
        <div class="vit-edition">${esc(c.edition || "platform")} · ${esc(c.workspace || "Workspace")}</div>
        <div class="vit-delta ${dCls}">${trendArrow(dCls)} ${delta > 0 ? "+" : ""}${delta} health</div>
      </div>
    </div>
    <div class="vit-bars">
      <div class="vit-bar">
        <div class="vit-bar-top"><span>Automation Level</span><b>${automation}%</b></div>
        <div class="meter teal"><i style="width:${automation}%"></i></div>
      </div>
      <div class="vit-bar">
        <div class="vit-bar-top"><span>Active Agents</span><b>${activeAgents}</b></div>
        <div class="meter"><i style="width:${agentPct}%"></i></div>
      </div>
    </div>`;

  if ($("tier-chip")) $("tier-chip").textContent = c.tier || "Seed";
  if ($("brand-sub")) $("brand-sub").textContent = `${esc(c.workspace || "Company")} · Simulator`;
}

function renderTopo(ws) {
  const lanes = ws.lanes || [];
  const connN = (view.connectors?.connectors || []).length;
  if ($("topo-sub")) $("topo-sub").textContent = `${(ws.agents || []).length} agents · ${connN} hubs`;
  if (!lanes.length) { $("topo").innerHTML = ""; return; }

  const W = 300, H = 170, cx = W / 2, cy = H / 2, r = 58;
  const pos = lanes.map((_, i) => {
    const ang = (i / lanes.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  });
  const links = lanes.map((l, i) => {
    const running = l.status === "running";
    return `<line class="t-link ${running ? "running" : ""}" x1="${cx}" y1="${cy}"
      x2="${pos[i].x.toFixed(1)}" y2="${pos[i].y.toFixed(1)}"></line>`;
  }).join("");
  const nodes = lanes.map((l, i) => {
    const color = LANE_STATUS_COLOR[l.status] || LANE_STATUS_COLOR.idle;
    const label = l.agentName && l.agentName !== "—" ? l.agentName : l.label;
    return `<g class="t-node">
      <circle cx="${pos[i].x.toFixed(1)}" cy="${pos[i].y.toFixed(1)}" r="11" fill="${color}"></circle>
      <text class="t-core-label" x="${pos[i].x.toFixed(1)}" y="${(pos[i].y + 2.6).toFixed(1)}">${esc(l.glyph || "")}</text>
      <text class="t-label" x="${pos[i].x.toFixed(1)}" y="${(pos[i].y + 24).toFixed(1)}">${esc(String(label).slice(0, 12))}</text>
    </g>`;
  }).join("");
  $("topo").innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    ${links}
    <g class="t-node"><circle class="t-core" cx="${cx}" cy="${cy}" r="16"></circle>
      <text class="t-core-label" x="${cx}" y="${cy + 3}">BB</text></g>
    ${nodes}
  </svg>`;
}

function renderLaneMap(ws) {
  const lanes = ws.lanes || [];
  $("lanemap").innerHTML = lanes.length ? lanes.map((l) => `
    <div class="lane-row" data-st="${esc(l.status || "idle")}">
      <span class="lane-glyph">${esc(l.glyph || "◈")}</span>
      <div class="lane-mid">
        <div class="lane-name"><span>${esc(l.label)}</span><span class="ln-agent">${esc(l.agentName || "—")}</span></div>
        <div class="lane-track"><i style="width:${clamp(l.load ?? 0, 0, 100)}%"></i></div>
      </div>
      <span class="lane-stat">${l.done ?? 0}/${l.total ?? 0}</span>
    </div>`).join("") : `<div class="list-empty">레인 정보가 없습니다.</div>`;
}

function renderRoster(ws) {
  const agents = (ws.agents || []).filter((a) =>
    matchesSearch(`${a.name} ${a.role} ${a.laneLabel} ${(a.capabilities || []).join(" ")}`));
  if ($("roster-sub")) $("roster-sub").textContent = String((ws.agents || []).length);
  $("roster").innerHTML = agents.length ? agents.map((a) => {
    const st = a.status || "idle";
    const energy = clamp(a.energy ?? 0, 0, 100);
    const focus = a.activeMission ? `▶ ${a.activeMission}` : (a.focus || "");
    return `
    <div class="emp">
      <div class="emp-av" style="background:${hueColor(a.id || a.name)}">${esc(initials(a.name))}</div>
      <div class="emp-main">
        <div class="emp-top">
          <span class="emp-name">${esc(a.name)}</span>
          <span class="emp-st st-${esc(st)}"><span class="sd"></span>${esc(st)}</span>
        </div>
        <div class="emp-role">${esc(a.role || "")}${a.laneLabel ? ` · ${esc(a.laneLabel)}` : ""}</div>
        <div class="emp-energy"><div class="meter"><i style="width:${energy}%"></i></div><small>${energy}</small></div>
        ${focus ? `<div class="emp-focus">${esc(focus)}</div>` : ""}
      </div>
    </div>`;
  }).join("") : `<div class="list-empty">검색 결과가 없습니다.</div>`;
}

function renderHero(ws) {
  const h = ws.headline || { title: "운영 대기 중", detail: "", level: "info" };
  const tier = ws.company?.tier || "Seed";
  const sparkSeries = (ws.kpis || []).find((k) => k.id === "automation")?.spark
    || (ws.kpis || [])[0]?.spark || [4, 6, 8, 7, 9];
  const hero = $("hero");
  hero.dataset.level = h.level || "info";
  hero.innerHTML = `
    <div class="hero-l">
      <span class="hero-tag"><span class="dotpulse"></span>Live · ${esc(tier)}</span>
      <h2>${esc(h.title)}</h2>
      <p>${esc(h.detail || "")}</p>
    </div>
    <div class="hero-r hero-spark">${sparkSvg(sparkSeries, 116, 56)}</div>`;
}

function renderPipeline(ws) {
  const stages = ws.pipeline?.stages || [];
  $("pipeline").innerHTML = stages.map((s) => `
    <div class="pstage" data-k="${esc(s.id)}"><b>${s.count ?? 0}</b><span>${esc(s.label)}</span></div>`).join("");
}

function renderKpis(ws) {
  const kpis = [...(ws.kpis || []), ...(ws.domainKpis || [])];
  $("kpis").innerHTML = kpis.map((k) => {
    const trend = k.trend || "flat";
    const delta = k.delta ?? 0;
    const deltaStr = typeof delta === "number" ? `${delta > 0 ? "+" : ""}${delta}` : esc(delta);
    return `
    <div class="kpi">
      <div class="kpi-l">${esc(k.label)}</div>
      <div class="kpi-v">${k.value ?? 0}${k.unit ? `<small>${esc(k.unit)}</small>` : ""}</div>
      <div class="kpi-delta ${trend}">${trendArrow(trend)} ${deltaStr}</div>
      <div class="spark">${sparkSvg(k.spark)}</div>
    </div>`;
  }).join("");
}

function renderObjectives(ws) {
  const objs = ws.objectives || [];
  const done = objs.filter((o) => o.status === "done").length;
  if ($("obj-sub")) $("obj-sub").textContent = `${done} / ${objs.length}`;
  $("objectives").innerHTML = objs.length ? objs.map((o) => {
    const pct = clamp(Math.round((o.done / Math.max(1, o.total)) * 100), 0, 100);
    return `
    <div class="obj" data-st="${esc(o.status)}">
      <div class="obj-check">✓</div>
      <div class="obj-body">
        <div class="obj-label">${esc(o.label)}</div>
        <div class="obj-track"><i style="width:${pct}%"></i></div>
      </div>
      <div class="obj-count">${o.done}/${o.total}</div>
    </div>`;
  }).join("") : `<div class="list-empty">목표가 없습니다.</div>`;
}

function renderStream(ws) {
  const beats = (ws.stream || []).filter((b) =>
    matchesSearch(`${b.title} ${b.detail} ${b.actor} ${b.laneLabel} ${b.kind}`));
  $("stream").innerHTML = beats.length ? beats.map((b) => `
    <div class="beat" data-lvl="${esc(b.level || "info")}">
      <div class="beat-rail"><span class="beat-node"></span><span class="beat-line"></span></div>
      <div class="beat-body">
        <div class="beat-head">
          <span class="beat-kind">${esc(b.kind || "event")}</span>
          <span class="beat-lane">${esc(b.laneLabel || "")}</span>
          <span class="beat-time">${fmtTime(b.ts)}</span>
        </div>
        <div class="beat-title">${esc(b.title)}</div>
        ${b.detail ? `<div class="beat-detail">${esc(b.detail)}</div>` : ""}
        ${b.reward ? `<span class="beat-reward">✦ ${esc(b.reward)}</span>` : ""}
      </div>
    </div>`).join("") : `<div class="stream-empty">운영 활동이 아직 없습니다. Seed로 회사를 구성하거나 미션을 실행하세요.</div>`;
}

function renderAlerts(ws) {
  const alerts = ws.alerts || [];
  if ($("alert-badge")) $("alert-badge").textContent = String(alerts.length);
  $("alerts").innerHTML = alerts.length ? alerts.map((a) => {
    const actions = a.kind === "approval" && a.approvalId ? `
      <div class="alert-actions">
        <button class="mini-btn ok" data-approve="${esc(a.approvalId)}">✓ 승인</button>
        <button class="mini-btn no" data-reject="${esc(a.approvalId)}">✕ 반려</button>
      </div>` : "";
    return `
    <div class="alert" data-kind="${esc(a.kind)}">
      <div class="alert-top"><span class="alert-kind">${esc(a.kind)}</span><span class="alert-title">${esc(a.title)}</span></div>
      <div class="alert-msg">${esc(a.message || "")}</div>
      ${actions}
    </div>`;
  }).join("") : `<div class="alerts-empty">대기 중인 알림이 없습니다.</div>`;

  wireDecisions();
}

function renderMissions(ws) {
  const all = ws.missions || [];
  const missions = all.filter((m) => matchesSearch(`${m.title} ${m.agent} ${m.laneLabel} ${m.status} ${m.priority}`));
  if ($("mission-sub")) $("mission-sub").textContent = String(all.length);
  $("missions").innerHTML = missions.length ? missions.map((m) => {
    const status = m.status || "queued";
    return `
    <div class="mission" data-lvl="${esc(m.level || "info")}">
      <div class="m-top">
        <span class="m-glyph">${esc(m.laneGlyph || "◈")}</span>
        <span class="m-title">${esc(m.title)}</span>
        <span class="m-pill ${esc(status)}">${esc(status.replace("_", " "))}</span>
      </div>
      <div class="m-meta">
        <span>${esc(m.agent || "—")}</span>
        <span class="m-tag ${m.priority === "high" ? "high" : ""}">${esc(m.priority || "normal")}</span>
        ${m.requiresApproval ? `<span class="m-tag">approval</span>` : ""}
        <span class="m-tag">${esc(m.laneLabel || "")}</span>
      </div>
      <div class="m-prog"><i style="width:${clamp(m.progress ?? 0, 0, 100)}%"></i></div>
      <button class="m-run" data-run="${esc(m.taskId || m.id)}" ${m.runnable ? "" : "disabled"}>
        ${esc(RUN_LABEL[status] || "▶ 실행")}
      </button>
    </div>`;
  }).join("") : `<div class="list-empty">미션이 없습니다.</div>`;

  wireRuns();
}

function renderAchievements(ws) {
  const ach = ws.achievements || [];
  const unlocked = ach.filter((a) => a.unlocked).length;
  if ($("ach-sub")) $("ach-sub").textContent = `${unlocked} / ${ach.length}`;
  $("achievements").innerHTML = ach.length ? ach.map((a) => `
    <div class="ach ${a.unlocked ? "on" : ""}">
      <div class="ach-icon">${esc(a.icon || "★")}</div>
      <div class="ach-label">${esc(a.label)}</div>
      <div class="ach-desc">${esc(a.desc || "")}</div>
    </div>`).join("") : `<div class="list-empty">업적이 없습니다.</div>`;
}

function renderKnowledge() {
  const kb = view.knowledge;
  if (!kb) return;
  const nodes = kb.nodes || [];
  const edges = kb.edges || [];
  const hits = view.hits || new Set();
  if ($("kg-sub")) $("kg-sub").textContent = String(nodes.length);

  const W = 340, H = 152, cx = W / 2, cy = H / 2, r = 56;
  const pos = {};
  nodes.forEach((n, i) => {
    const ang = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    pos[n.id] = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  });
  const edgeSvg = edges.map((e) => {
    const a = pos[e.fromId], b = pos[e.toId];
    if (!a || !b) return "";
    return `<line class="k-edge" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`;
  }).join("");
  const nodeSvg = nodes.map((n) => {
    const p = pos[n.id];
    const hot = hits.has(n.id);
    const short = (n.title || "").length > 12 ? n.title.slice(0, 11) + "…" : (n.title || "");
    return `<g class="k-node ${hot ? "hit" : ""}">
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${hot ? 7 : 5}" fill="${hueColor(n.nodeType || n.title)}"></circle>
      <text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}">${esc(short)}</text>
    </g>`;
  }).join("");
  $("kg-mini").innerHTML = nodes.length
    ? `<svg viewBox="0 0 ${W} ${H}">${edgeSvg}${nodeSvg}</svg>`
    : `<div class="list-empty">지식 그래프가 비어 있습니다.</div>`;
}

function renderLive(live) {
  const counts = live.counts || {};
  const meta = $("live-meta");
  if (meta) meta.textContent =
    `${live.returned ?? (live.entries || []).length} entries · updated ${fmtTime(live.generatedAt)}`;
  const lf = $("live-filters");
  if (lf) lf.querySelectorAll(".lf").forEach((b) => {
    const src = b.dataset.src;
    const n = src === "all" ? (live.returned ?? 0) : (counts[src] ?? 0);
    b.textContent = src === "all" ? "all" : `${src} ${n}`;
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

// Render the whole simulator surface from a workstream-shaped object.
function renderWorkstream(ws) {
  renderVitals(ws);
  renderTopo(ws);
  renderLaneMap(ws);
  renderRoster(ws);
  renderHero(ws);
  renderPipeline(ws);
  renderKpis(ws);
  renderObjectives(ws);
  renderStream(ws);
  renderAlerts(ws);
  renderMissions(ws);
  renderAchievements(ws);
}

// ── action wiring (re-attached after each render) ───────────────────────
function wireRuns() {
  document.querySelectorAll("[data-run]").forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => runTask(btn.dataset.run));
  });
}
function wireDecisions() {
  document.querySelectorAll("[data-approve]").forEach((b) =>
    b.addEventListener("click", () => decide(b.dataset.approve, "approved")));
  document.querySelectorAll("[data-reject]").forEach((b) =>
    b.addEventListener("click", () => decide(b.dataset.reject, "rejected")));
}

// ── fallback: synthesize a workstream view from /overview ────────────────
function synthFromOverview(ov) {
  const m = ov.metrics || {};
  const tasks = ov.tasks || [];
  const agents = ov.agents || [];
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length || 1;
  const pending = ov.approvals?.filter((a) => a.status === "pending").length ?? 0;
  return {
    company: {
      name: ov.tenant?.name || "Company",
      edition: ov.tenant?.edition || ov.workspace?.editionId || "platform",
      workspace: ov.workspace?.name || "Workspace",
      healthScore: 64, healthDelta: 0,
      automationLevel: clamp(Math.round((completed / total) * 100), 0, 100),
      tier: "Seed", activeAgents: m.activeAgents ?? agents.length
    },
    headline: { title: "기본 운영 보드", detail: "workstream 프로젝션을 사용할 수 없어 개요 데이터로 표시합니다.", level: "info" },
    kpis: [
      { id: "active", label: "Active Agents", value: m.activeAgents ?? 0, unit: "", delta: 0, trend: "flat", spark: [] },
      { id: "queued", label: "Queued", value: m.queuedTasks ?? 0, unit: "", delta: 0, trend: "flat", spark: [] },
      { id: "approvals", label: "Approvals", value: pending, unit: "", delta: -pending, trend: pending ? "down" : "flat", spark: [] },
      { id: "done", label: "Completed", value: completed, unit: "", delta: completed, trend: completed ? "up" : "flat", spark: [] }
    ],
    domainKpis: [],
    missions: tasks.map((t) => ({
      id: t.id, taskId: t.id, title: t.title, laneGlyph: "◈", laneLabel: t.category || "task",
      agent: "", status: t.status || "queued",
      level: { queued: "info", running: "running", waiting_approval: "pending", completed: "success", failed: "error" }[t.status] || "info",
      progress: { queued: 8, running: 56, waiting_approval: 78, completed: 100, failed: 100 }[t.status] ?? 8,
      priority: t.priority || "normal", requiresApproval: !!t.requiresApproval,
      runnable: t.status === "queued" || t.status === "running"
    })),
    agents: agents.map((a) => ({
      id: a.id, name: a.name, role: a.role || "", laneLabel: "", status: a.status || "idle",
      energy: 60, focus: "", activeMission: null, capabilities: a.capabilities || []
    })),
    lanes: [],
    pipeline: { stages: [
      { id: "queued", label: "Queued", count: m.queuedTasks ?? 0 },
      { id: "running", label: "Running", count: m.runningTasks ?? 0 },
      { id: "waiting_approval", label: "Approval", count: m.waitingApproval ?? 0 },
      { id: "completed", label: "Done", count: completed }
    ] },
    objectives: [],
    alerts: (ov.approvals || []).filter((a) => a.status === "pending").map((a) => ({
      id: `al_${a.id}`, kind: "approval", title: a.title || "승인 필요",
      message: a.summary || a.reason || "", approvalId: a.id
    })),
    achievements: [],
    stream: []
  };
}

// ── data loads ──────────────────────────────────────────────────────────
async function loadSurface() {
  try {
    view.ws = await request(`/api/workspaces/${workspace}/workstream`);
    setConn(true, "connected");
  } catch (err) {
    // Workstream projection absent — fall back to the overview projection.
    try {
      const ov = await request(`/api/workspaces/${workspace}/overview`);
      view.ws = synthFromOverview(ov);
      setConn(true, "fallback");
    } catch (err2) {
      throw err2;
    }
  }
  renderWorkstream(view.ws);
}

async function loadConnectors() {
  try {
    view.connectors = await request(`/api/connectors`);
    if (view.ws) renderTopo(view.ws);
  } catch { /* connectors are decorative; ignore */ }
}

async function loadKnowledge() {
  try {
    view.knowledge = await request(`/api/knowledge`);
    renderKnowledge();
  } catch { /* knowledge graph optional */ }
}

async function loadLive() {
  try {
    view.live = await request(`/api/workspaces/${workspace}/live-log`);
    renderLive(view.live);
  } catch {
    if ($("live-meta")) $("live-meta").textContent = "live-log 연결 실패";
  }
}

async function loadAll() {
  try {
    await Promise.all([loadSurface(), loadConnectors(), loadKnowledge(), loadLive()]);
    if (view.search.trim()) await runKnowledgeSearch();
  } catch (err) {
    setConn(false, "disconnected");
    if ($("stream")) $("stream").innerHTML = `<div class="stream-empty">API 연결 실패: ${esc(err.message)}</div>`;
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
  } catch { setConn(false, "run failed"); }
  await loadSurface();
  await loadLive(); // log should visibly grow right after the run
}

async function decide(approvalId, decision) {
  try {
    await request(`/api/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, decidedBy: "control-room" })
    });
  } catch { setConn(false, "decision failed"); }
  await loadSurface();
  await loadLive();
}

// ── search ───────────────────────────────────────────────────────────────
async function runKnowledgeSearch() {
  const q = view.search.trim();
  if (q && view.knowledge) {
    try {
      const res = await request(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
      view.hits = new Set((res.results || []).map((r) => r.id));
    } catch { view.hits = new Set(); }
  } else {
    view.hits = new Set();
  }
  renderKnowledge();
}

function applySearch() {
  // Re-render local views with the current filter (no refetch needed).
  if (view.ws) {
    renderRoster(view.ws);
    renderMissions(view.ws);
    renderStream(view.ws);
  }
  if (view.live) renderLive(view.live);
  runKnowledgeSearch();
}

// ── live auto-refresh loop ───────────────────────────────────────────────
function startLiveTimer() {
  stopLiveTimer();
  if (!view.autoLive) return;
  liveTimer = setInterval(() => { loadLive(); loadSurface(); }, LIVE_INTERVAL_MS);
}
function stopLiveTimer() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}
function setAuto(on) {
  view.autoLive = on;
  if ($("auto-toggle")) $("auto-toggle").classList.toggle("active", on);
  if ($("auto-label")) $("auto-label").textContent = on ? "Auto 2.5s" : "Paused";
  if ($("live-pulse")) $("live-pulse").classList.toggle("paused", !on);
  startLiveTimer();
}

// ── responsive drawers + bottom nav ──────────────────────────────────────
function setPanel(panel) {
  document.body.dataset.panel = panel;
  document.querySelectorAll(".bn").forEach((b) => b.classList.toggle("active", b.dataset.nav === panel));
  // On tablet, "inspector"/"debug" map onto slide-in drawers.
  if (panel === "inspector") document.body.classList.add("insp-open");
  if (panel === "debug") document.body.classList.add("debug-open");
}

// ── wiring ───────────────────────────────────────────────────────────────
function on(id, evt, fn) { const el = $(id); if (el) el.addEventListener(evt, fn); }

on("refresh", "click", loadAll);
on("seed", "click", async () => {
  try { await request(`/api/demo/seed`, { method: "POST" }); }
  catch { setConn(false, "seed failed"); }
  await loadAll();
});
on("live-refresh", "click", loadLive);
on("auto-toggle", "click", () => setAuto(!view.autoLive));

on("debug-toggle", "click", () => document.body.classList.toggle("debug-open"));
on("debug-close", "click", () => document.body.classList.remove("debug-open"));
on("insp-toggle", "click", () => document.body.classList.toggle("insp-open"));
on("insp-close", "click", () => document.body.classList.remove("insp-open"));

const liveFilters = $("live-filters");
if (liveFilters) liveFilters.querySelectorAll(".lf").forEach((b) =>
  b.addEventListener("click", () => {
    view.liveFilter = b.dataset.src;
    if (view.live) renderLive(view.live);
  }));

document.querySelectorAll(".bn").forEach((b) =>
  b.addEventListener("click", () => setPanel(b.dataset.nav)));

on("search", "input", (e) => {
  view.search = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 180);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("search")) {
    e.preventDefault();
    if ($("search")) $("search").focus();
  }
  if (e.key === "Escape") {
    document.body.classList.remove("debug-open", "insp-open");
  }
});

// Pause polling when the tab is hidden; resume on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopLiveTimer();
  else if (view.autoLive) { loadLive(); loadSurface(); startLiveTimer(); }
});

// boot
loadAll();
startLiveTimer();
