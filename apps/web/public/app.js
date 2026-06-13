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
  autoLive: true,
  // Agent Performance Market (front stage).
  perfCategory: "all",   // lane filter pill
  perfStatus: "all",     // agent status filter pill
  watchOnly: false,      // "관심만" toggle
  watched: new Set(),    // client-side 관심 set (seeded once from server flags)
  watchedInit: false,
  detailAgentId: null,   // agent whose detail drawer is open (null = closed)
  pending: new Set(),    // approvalIds with an in-flight optimistic decision
  // Focus / progressive disclosure front stage.
  layer: "focus",        // focus | performance | process | organization
  selectedTaskId: null,  // task currently driving the focus flow
  selectedLabel: ""      // human label of the selected goal/mission
};
function isWatched(id) { return view.watched.has(id); }
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
  return `hsl(${h} 58% 50%)`;
}
function fmtTime(iso) {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString("en-GB", { hour12: false });
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function trendArrow(t) { return t === "up" ? "▲" : t === "down" ? "▼" : "·"; }
// "+3 (+5.2%)" style delta string for performance / index cards.
function deltaStr(d, pct) {
  const dd = typeof d === "number" ? `${d > 0 ? "+" : ""}${d}` : esc(d);
  const pp = (typeof pct === "number") ? ` (${pct > 0 ? "+" : ""}${pct}%)` : "";
  return `${dd}${pp}`;
}

const LANE_STATUS_COLOR = {
  running: "#3182f6", success: "#15c47e", error: "#f04452", idle: "#c4cdd6", info: "#8b95a1"
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

// Build a stock-style SVG chart (gradient area + line + end dot) from a numeric
// series. The series is scaled between its own min and max — like a price chart
// — so movement reads clearly instead of being flattened against a zero
// baseline. Trend coloring (상승 red / 하락 blue) is applied via CSS classes on
// the container; the gradient fill picks up `currentColor` so it tints with the
// trend automatically and no external defs collide.
//   opts.dot      — draw the trailing marker dot (default true)
//   opts.dotR     — marker radius
//   opts.grid     — draw faint horizontal guide lines (default false)
//   opts.baseline — draw a dashed reference line at the opening value (default false)
//   opts.area     — fill the area under the line (default true)
//   opts.label    — print the closing value at the trailing dot (default false)
let _sparkSeq = 0;
function sparkSvg(series, w = 100, h = 28, opts = {}) {
  let s = Array.isArray(series) ? series.filter((v) => typeof v === "number" && Number.isFinite(v)) : [];
  if (s.length === 0) s = [0, 0];
  if (s.length === 1) s = [s[0], s[0]];
  const n = s.length;
  const min = Math.min(...s), max = Math.max(...s);
  const span = (max - min) || 1;
  const padY = Math.max(3, opts.padY ?? 3), usableH = h - padY * 2;
  const yOf = (v) => padY + (1 - (v - min) / span) * usableH;
  const pts = s.map((v, i) => [(i / (n - 1)) * w, yOf(v)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const gid = `spg${++_sparkSeq}`;
  const area = opts.area === false ? "" : (() => {
    const fill = `${line} L ${w.toFixed(1)} ${h} L 0 ${h} Z`;
    return `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">`
      + `<stop class="sp-g0" offset="0%"/><stop class="sp-g1" offset="100%"/>`
      + `</linearGradient></defs><path class="sp-fill" fill="url(#${gid})" d="${fill}"/>`;
  })();
  const grid = opts.grid
    ? [0.25, 0.5, 0.75].map((f) =>
        `<line class="sp-base" x1="0" y1="${(padY + f * usableH).toFixed(1)}" x2="${w}" y2="${(padY + f * usableH).toFixed(1)}"/>`).join("")
    : "";
  const baseline = opts.baseline
    ? `<line class="sp-open" x1="0" y1="${yOf(s[0]).toFixed(1)}" x2="${w}" y2="${yOf(s[0]).toFixed(1)}"/>`
    : "";
  const dot = opts.dot === false ? ""
    : `<circle class="sp-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="${opts.dotR || 2}"/>`;
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`
    + `${grid}${area}${baseline}<path class="sp-line" d="${line}"/>${dot}</svg>`;
}

// ── renderers ──────────────────────────────────────────────────────────
function renderVitals(ws) {
  const c = ws.company || {};
  const health = clamp(Math.round(c.healthScore ?? 0), 0, 100);
  const R = 42, C = 2 * Math.PI * R;
  const offset = C * (1 - health / 100);
  const ringColor = health >= 70 ? "var(--green)" : health >= 40 ? "var(--amber)" : "var(--red)";
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
    <div class="hero-r hero-spark">${sparkSvg(sparkSeries, 132, 60, { grid: true, baseline: true, dotR: 2.6 })}</div>`;
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
      <div class="spark ${trend}">${sparkSvg(k.spark, 100, 28)}</div>
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

// ── Agent Performance Market (front stage) ───────────────────────────────
function renderMarketStatus(ws) {
  const st = ws.market?.status || { code: "idle", label: "운영 대기" };
  const chip = $("market-status");
  if (chip) {
    chip.dataset.code = st.code || "idle";
    const lbl = chip.querySelector(".ms-label");
    if (lbl) lbl.textContent = st.label || "운영 대기";
  }
  if ($("market-asof")) $("market-asof").textContent = `기준 ${fmtTime(ws.market?.asOf || ws.generatedAt)}`;
}

// 지수 카드 (summary index cards with mini sparkline).
function renderIndices(ws) {
  const idx = ws.market?.indices || [];
  $("indices").innerHTML = idx.length ? idx.map((k) => {
    const trend = k.trend || "flat";
    return `
    <div class="idx" data-tr="${esc(trend)}">
      <div class="idx-l">${esc(k.label)}</div>
      <div class="idx-v">${k.value ?? 0}${k.unit ? `<small>${esc(k.unit)}</small>` : ""}</div>
      <div class="idx-d ${trend}"><span class="delta-badge ${trend}">${trendArrow(trend)} ${deltaStr(k.delta, k.deltaPercent)}</span></div>
      <div class="idx-spark">${sparkSvg(k.spark, 120, 40, { baseline: true, dotR: 2.2 })}</div>
    </div>`;
  }).join("") : `<div class="list-empty">지수 데이터를 불러오는 중…</div>`;
}

// 필터 pill (category by lane · status · 관심만).
function renderFilters(ws) {
  const cats = ws.market?.categories || [];
  const cat = (id, label, count) => `
    <button class="pill ${view.perfCategory === id ? "active" : ""}" data-cat="${esc(id)}">
      ${esc(label)}${typeof count === "number" ? `<i>${count}</i>` : ""}
    </button>`;
  const STATUS = [["all", "전체"], ["running", "실행"], ["idle", "대기"], ["blocked", "차단"]];
  const statusPills = STATUS.map(([k, l]) =>
    `<button class="pill st ${view.perfStatus === k ? "active" : ""}" data-st="${k}">${l}</button>`).join("");
  const el = $("perf-filters");
  if (!el) return;
  el.innerHTML = `
    <div class="pill-row">
      ${cat("all", "전체 라인")}
      ${cats.map((c) => cat(c.id, c.label, c.count)).join("")}
    </div>
    <div class="pill-row">
      ${statusPills}
      <button class="pill watch ${view.watchOnly ? "active" : ""}" data-watchonly="1">★ 관심만</button>
    </div>`;
  el.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => { view.perfCategory = b.dataset.cat; renderFilters(view.ws); renderPerfBoard(view.ws); }));
  el.querySelectorAll("[data-st]").forEach((b) =>
    b.addEventListener("click", () => { view.perfStatus = b.dataset.st; renderFilters(view.ws); renderPerfBoard(view.ws); }));
  const wo = el.querySelector("[data-watchonly]");
  if (wo) wo.addEventListener("click", () => { view.watchOnly = !view.watchOnly; renderFilters(view.ws); renderPerfBoard(view.ws); });
}

// One ranking row (securities-style: rank · agent · score+spark · delta ·
// 자동화/사람 split · 처리량 · AI 요약 · 관심/실행).
function perfRow(p) {
  const w = isWatched(p.id);
  const run = p.runnableMissionId
    ? `<button class="pb-run" data-run="${esc(p.runnableMissionId)}" title="대표 미션 실행">▶</button>`
    : `<span class="pb-run ghost" aria-hidden="true">–</span>`;
  const rankCls = p.rank <= 3 ? ` medal rank-${p.rank}` : "";
  return `
  <div class="pb-row" data-st="${esc(p.status)}" data-detail="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} 상세 보기">
    <span class="pb-rank${rankCls}">${p.rank}</span>
    <div class="pb-agent">
      <span class="pb-av" style="background:${hueColor(p.id || p.name)}">${esc(initials(p.name))}</span>
      <span class="pb-id">
        <b>${esc(p.name)}</b>
        <small><i class="st-dot st-${esc(p.status)}"></i>${esc(p.statusLabel || p.status)} · ${esc(p.laneLabel || "")}</small>
      </span>
    </div>
    <div class="pb-score"><b>${p.score ?? 0}</b><span class="pb-spark ${esc(p.trend || "flat")}">${sparkSvg(p.spark, 72, 24, { dotR: 1.8 })}</span></div>
    <div class="pb-delta ${esc(p.trend || "flat")}">${trendArrow(p.trend)} ${deltaStr(p.delta, p.deltaPercent)}</div>
    <div class="pb-split" title="자동화 ${p.automationRatio}% · 사람 ${p.humanRatio}%">
      <div class="split-bar"><i class="auto" style="width:${clamp(p.automationRatio ?? 0, 0, 100)}%"></i><i class="human" style="width:${clamp(p.humanRatio ?? 0, 0, 100)}%"></i></div>
      <small>자동 ${p.automationRatio ?? 0}% · 사람 ${p.humanRatio ?? 0}%</small>
    </div>
    <div class="pb-vol"><div class="meter"><i style="width:${clamp(p.volume ?? 0, 0, 100)}%"></i></div><small>${p.workload ?? 0}</small></div>
    <div class="pb-sum">${esc(p.summary || "")}</div>
    <div class="pb-act">
      <button class="pb-star ${w ? "on" : ""}" data-watch="${esc(p.id)}" title="관심 토글" aria-pressed="${w}">${w ? "★" : "☆"}</button>
      ${run}
    </div>
  </div>`;
}

function renderPerfBoard(ws) {
  let rows = (ws.agentPerformance || []).slice();
  if (view.perfCategory !== "all") rows = rows.filter((p) => p.lane === view.perfCategory);
  if (view.perfStatus !== "all") rows = rows.filter((p) => p.status === view.perfStatus);
  if (view.watchOnly) rows = rows.filter((p) => isWatched(p.id));
  rows = rows.filter((p) => matchesSearch(`${p.name} ${p.role} ${p.laneLabel} ${p.summary} ${p.status}`));
  if ($("perf-sub")) $("perf-sub").textContent = `${rows.length} agents`;
  const head = `
    <div class="pb-headrow" aria-hidden="true">
      <span class="pb-rank">#</span>
      <span class="pb-agent">에이전트</span>
      <span class="pb-score">성과 점수</span>
      <span class="pb-delta">변화</span>
      <span class="pb-split">자동화 · 사람</span>
      <span class="pb-vol">처리량</span>
      <span class="pb-sum">AI 요약</span>
      <span class="pb-act"></span>
    </div>`;
  $("perf-board").innerHTML = rows.length
    ? head + rows.map(perfRow).join("")
    : `<div class="list-empty">조건에 맞는 에이전트가 없습니다.</div>`;
  wireBoard();
}

function wireBoard() {
  document.querySelectorAll("#perf-board [data-watch]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleWatch(b.dataset.watch); }));
  document.querySelectorAll("#perf-board [data-run]").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", (e) => { e.stopPropagation(); runTask(b.dataset.run, b); });
  });
  // Clicking (or Enter/Space on) a ranking row opens the agent detail drawer.
  document.querySelectorAll("#perf-board .pb-row[data-detail]").forEach((row) => {
    row.addEventListener("click", () => openAgentDetail(row.dataset.detail));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAgentDetail(row.dataset.detail); }
    });
  });
}

function toggleWatch(id) {
  if (!id) return;
  if (view.watched.has(id)) view.watched.delete(id); else view.watched.add(id);
  renderPerfBoard(view.ws);
  renderWatchlist(view.ws);
}

// 관심 에이전트 TOP 10 (right rail watchlist).
function renderWatchlist(ws) {
  const list = (ws.agentPerformance || []).filter((p) => isWatched(p.id)).slice(0, 10);
  if ($("watch-sub")) $("watch-sub").textContent = String(list.length);
  $("watchlist").innerHTML = list.length ? list.map((p, i) => `
    <div class="wl-row" data-detail="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} 상세 보기">
      <span class="wl-rank">${i + 1}</span>
      <span class="wl-av" style="background:${hueColor(p.id || p.name)}">${esc(initials(p.name))}</span>
      <div class="wl-mid">
        <div class="wl-name">${esc(p.name)}</div>
        <div class="wl-meta">${esc(p.laneLabel || "")} · 점수 ${p.score ?? 0}</div>
      </div>
      <div class="wl-delta ${esc(p.trend || "flat")}">${trendArrow(p.trend)} ${deltaStr(p.delta, p.deltaPercent)}</div>
      <button class="wl-star on" data-watch="${esc(p.id)}" title="관심 해제">★</button>
    </div>`).join("") : `<div class="list-empty">★ 로 관심 에이전트를 추가하세요.</div>`;
  document.querySelectorAll("#watchlist [data-watch]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleWatch(b.dataset.watch); }));
  document.querySelectorAll("#watchlist [data-detail]").forEach((b) =>
    b.addEventListener("click", () => openAgentDetail(b.dataset.detail)));
}

// ── Agent detail drawer (ranking row → side panel chart + summary + actions) ─
function perfById(id) { return (view.ws?.agentPerformance || []).find((p) => p.id === id) || null; }
function agentById(id) { return (view.ws?.agents || []).find((a) => a.id === id) || null; }

function openAgentDetail(id) {
  if (!id) return;
  view.detailAgentId = id;
  document.body.classList.add("agent-open");
  const dr = $("agent-drawer");
  if (dr) dr.setAttribute("aria-hidden", "false");
  renderAgentDetail();
}
function closeAgentDetail() {
  view.detailAgentId = null;
  document.body.classList.remove("agent-open");
  const dr = $("agent-drawer");
  if (dr) dr.setAttribute("aria-hidden", "true");
}

function renderAgentDetail() {
  const el = $("agent-detail");
  if (!el || !view.detailAgentId) return;
  const p = perfById(view.detailAgentId);
  if (!p) { closeAgentDetail(); return; }
  const a = agentById(p.id) || {};
  const w = isWatched(p.id);
  const trend = p.trend || "flat";
  const energy = clamp(a.energy ?? 0, 0, 100);
  // Recent narrative beats authored by this agent (front-stage activity feed).
  const beats = (view.ws?.stream || [])
    .filter((b) => b.actor === p.name || b.agentName === p.name)
    .slice(0, 4);
  const runBtn = p.runnableMissionId
    ? `<button class="ad-run" data-run="${esc(p.runnableMissionId)}">▶ 대표 미션 실행</button>`
    : `<button class="ad-run" disabled>실행 가능한 미션 없음</button>`;
  el.innerHTML = `
    <header class="ad-head">
      <button class="ad-close" id="ad-close" aria-label="닫기">✕</button>
      <div class="ad-id">
        <span class="ad-av" style="background:${hueColor(p.id || p.name)}">${esc(initials(p.name))}</span>
        <div class="ad-id-txt">
          <div class="ad-name">${esc(p.name)} <span class="ad-rank rank-${p.rank <= 3 ? p.rank : "n"}">#${p.rank}</span></div>
          <div class="ad-role">${esc(p.role || "")}${p.laneLabel ? ` · ${esc(p.laneLabel)}` : ""}</div>
        </div>
        <span class="ad-status st-${esc(p.status)}"><i class="st-dot st-${esc(p.status)}"></i>${esc(p.statusLabel || p.status)}</span>
      </div>
    </header>

    <div class="ad-ticker">
      <div class="ad-score"><span class="ad-score-label">성과 점수</span><b class="ticker">${p.score ?? 0}</b></div>
      <span class="delta-badge lg ${trend}">${trendArrow(trend)} ${deltaStr(p.delta, p.deltaPercent)}</span>
    </div>

    <div class="ad-chart ${trend}">${sparkSvg(p.spark, 320, 132, { grid: true, baseline: true, dotR: 3, padY: 8 })}</div>

    <div class="ad-split-block">
      <div class="ad-split-top"><span>자동화 ${p.automationRatio ?? 0}%</span><span>사람 개입 ${p.humanRatio ?? 0}%</span></div>
      <div class="split-bar lg"><i class="auto" style="width:${clamp(p.automationRatio ?? 0, 0, 100)}%"></i><i class="human" style="width:${clamp(p.humanRatio ?? 0, 0, 100)}%"></i></div>
    </div>

    <div class="ad-metrics">
      <div class="ad-metric"><span>처리량</span><b>${p.workload ?? 0}</b></div>
      <div class="ad-metric"><span>미션 완료</span><b>${p.missionsDone ?? 0}</b></div>
      <div class="ad-metric"><span>진행 중</span><b>${p.missionsActive ?? 0}</b></div>
      <div class="ad-metric"><span>에너지</span><b>${energy}</b></div>
    </div>

    <p class="ad-summary">${esc(p.summary || "")}</p>

    <div class="ad-actions">
      <button class="ad-star ${w ? "on" : ""}" data-watch="${esc(p.id)}" aria-pressed="${w}">${w ? "★ 관심 등록됨" : "☆ 관심 추가"}</button>
      ${runBtn}
    </div>

    ${beats.length ? `<div class="ad-feed">
      <div class="ad-feed-h">최근 활동</div>
      ${beats.map((b) => `
        <div class="ad-beat" data-lvl="${esc(b.level || "info")}">
          <span class="ad-beat-dot"></span>
          <div><div class="ad-beat-t">${esc(b.title)}</div><div class="ad-beat-time">${fmtTime(b.ts)}</div></div>
        </div>`).join("")}
    </div>` : ""}`;

  on("ad-close", "click", closeAgentDetail);
  el.querySelectorAll("[data-watch]").forEach((b) =>
    b.addEventListener("click", () => { toggleWatch(b.dataset.watch); renderAgentDetail(); }));
  el.querySelectorAll("[data-run]").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => runTask(b.dataset.run, b));
  });
}

// ── Onboarding overlay (오늘 뭐부터 할까요? → objective cards → start) ──────
function renderOnboard(ws) {
  const lanes = (ws.lanes || []).filter((l) => (l.total ?? 0) > 0);
  const el = $("onboard-cards");
  if (!el) return;
  el.innerHTML = lanes.length ? lanes.map((l) => `
    <button class="ob-card" data-cat="${esc(l.id)}">
      <span class="ob-glyph">${esc(l.glyph || "◈")}</span>
      <span class="ob-title">${esc(l.label)}</span>
      <span class="ob-sub">${esc(l.agentName || "—")} · ${l.done ?? 0}/${l.total ?? 0}</span>
      <span class="ob-go">이 목표로 시작 →</span>
    </button>`).join("") : `<div class="list-empty">먼저 ⟲ 데모 채우기로 회사를 구성하세요.</div>`;
  el.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      view.perfCategory = b.dataset.cat;
      renderFilters(view.ws); renderPerfBoard(view.ws);
      setLayer("performance");
      closeOnboard(true);
    }));
}
function openOnboard() { document.body.classList.add("onboard-open"); if (view.ws) renderOnboard(view.ws); }
function closeOnboard(persist) {
  document.body.classList.remove("onboard-open");
  if (persist) { try { localStorage.setItem("bb_onboarded", "1"); } catch { /* ignore */ } }
}

// ── Focus front stage (progressive disclosure · Claude-simple home) ──────
// The home view shows only: composer · 3 objective cards · current flow ·
// a compact status summary. All heavy market/map/log surfaces live behind
// the layer buttons and are hidden by default.

// Lifecycle steps for a single task, used by the "진행 흐름" tracker.
function flowSteps(requiresApproval) {
  return requiresApproval
    ? [["queued", "접수"], ["running", "실행"], ["waiting_approval", "승인"], ["completed", "완료"]]
    : [["queued", "접수"], ["running", "실행"], ["completed", "완료"]];
}
function missionByTaskId(id) {
  if (!id) return null;
  return (view.ws?.missions || []).find((m) => (m.taskId || m.id) === id) || null;
}

// Pick a runnable mission for a lane (by matching label → agent perf → any).
function runnableTaskForLane(ws, lane) {
  const byLabel = (ws.missions || []).find((m) => m.runnable && m.laneLabel === lane.label);
  if (byLabel) return { taskId: byLabel.taskId || byLabel.id, label: byLabel.title };
  const perf = (ws.agentPerformance || []).find((p) => p.lane === lane.id && p.runnableMissionId);
  if (perf) {
    const mm = missionByTaskId(perf.runnableMissionId);
    return { taskId: perf.runnableMissionId, label: mm?.title || lane.label };
  }
  const any = (ws.missions || []).find((m) => m.runnable);
  return any ? { taskId: any.taskId || any.id, label: any.title } : null;
}

// Map free composer text to the nearest existing runnable mission (token score).
function mapTextToTask(ws, text) {
  const q = String(text || "").toLowerCase().trim();
  if (!q) return null;
  const tokens = q.split(/[^0-9a-z가-힣]+/i).filter((t) => t.length > 1);
  const missions = ws.missions || [];
  let best = null, bestScore = 0;
  for (const m of missions) {
    const hay = `${m.title} ${m.laneLabel} ${m.agent} ${m.priority} ${m.status}`.toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 5;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    if (m.runnable) score += 0.5; // gently prefer something we can actually start
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (best && bestScore >= 1) return { taskId: best.taskId || best.id, label: best.title, runnable: best.runnable };
  // No keyword hit — fall back to the first runnable mission so the act still works.
  const any = missions.find((m) => m.runnable);
  return any ? { taskId: any.taskId || any.id, label: any.title, runnable: true, fallback: true } : null;
}

function renderFocusGreeting(ws) {
  const c = ws.company || {};
  const st = ws.market?.status || { code: "idle", label: "운영 대기" };
  const active = c.activeAgents ?? (ws.agents || []).length;
  if ($("fg-text")) $("fg-text").textContent =
    `${esc(c.name || "회사")} · ${esc(st.label)} · 가동 에이전트 ${active}`;
  const dot = document.querySelector(".fg-dot");
  if (dot) dot.dataset.code = st.code || "idle";
}

function renderFocusCards(ws) {
  const el = $("focus-cards");
  if (!el) return;
  const lanes = (ws.lanes || []).filter((l) => (l.total ?? 0) > 0).slice(0, 3);
  if (!lanes.length) {
    el.innerHTML = `<div class="focus-empty">⟲ 데모 채우기로 회사를 구성하면 목표 카드가 나타납니다.</div>`;
    return;
  }
  el.innerHTML = lanes.map((l) => {
    const pct = clamp(Math.round(((l.done ?? 0) / Math.max(1, l.total ?? 1)) * 100), 0, 100);
    const sel = view.selectedLaneId === l.id ? " active" : "";
    return `
    <button class="goal-card${sel}" data-lane="${esc(l.id)}">
      <span class="gc-glyph">${esc(l.glyph || "◈")}</span>
      <span class="gc-title">${esc(l.label)}</span>
      <span class="gc-sub">${esc(l.agentName || "—")}</span>
      <span class="gc-track"><i style="width:${pct}%"></i></span>
      <span class="gc-foot"><span>${l.done ?? 0}/${l.total ?? 0}</span><span class="gc-go">맡기기 →</span></span>
    </button>`;
  }).join("");
  el.querySelectorAll("[data-lane]").forEach((b) =>
    b.addEventListener("click", () => selectObjective(b.dataset.lane)));
}

function renderFocusStatus(ws) {
  const el = $("focus-status");
  if (!el) return;
  const stages = ws.pipeline?.stages || [];
  const stage = (id) => stages.find((s) => s.id === id)?.count ?? 0;
  const c = ws.company || {};
  const items = [
    { k: "가동 에이전트", v: c.activeAgents ?? (ws.agents || []).length },
    { k: "진행 중", v: stage("running") },
    { k: "승인 대기", v: stage("waiting_approval") },
    { k: "완료", v: stage("completed") },
    { k: "자동화", v: `${clamp(Math.round(c.automationLevel ?? 0), 0, 100)}%` }
  ];
  el.innerHTML = items.map((i) => `
    <div class="fs-cell"><b>${esc(String(i.v))}</b><span>${esc(i.k)}</span></div>`).join("");
}

function renderFocusFlow(ws) {
  const ol = $("focus-flow");
  if (!ol) return;
  const m = missionByTaskId(view.selectedTaskId);
  const sub = $("focus-flow-sub");
  const title = $("focus-flow-title");

  if (!m) {
    // No goal selected yet — show the company pipeline as an ambient flow.
    const stages = ws.pipeline?.stages || [];
    if (title) title.textContent = "진행 흐름";
    if (sub) sub.textContent = view.selectedLabel ? esc(view.selectedLabel) : "목표를 고르거나 한 줄로 적어보세요";
    ol.innerHTML = stages.length ? stages.map((s, i) => `
      <li class="flow-step${i === 0 ? " active" : ""}">
        <span class="flow-dot">${s.count ?? 0}</span>
        <span class="flow-label">${esc(s.label)}</span>
      </li>`).join("") : `<li class="flow-step active"><span class="flow-dot">·</span><span class="flow-label">대기 중</span></li>`;
    return;
  }

  const status = m.status || "queued";
  const steps = flowSteps(!!m.requiresApproval);
  const order = steps.map((s) => s[0]);
  let curIdx = order.indexOf(status);
  if (status === "completed" || status === "failed") curIdx = order.length - 1;
  if (curIdx < 0) curIdx = 0;
  if (title) title.textContent = esc(m.title);
  if (sub) sub.textContent = status === "completed" ? "완료됨"
    : status === "failed" ? "실패 · 재실행 가능"
    : status === "waiting_approval" ? "승인 대기 중"
    : status === "running" ? "실행 중…" : "대기 중";

  ol.innerHTML = steps.map(([code, label], i) => {
    const failed = status === "failed" && i === steps.length - 1;
    const cls = failed ? "fail" : i < curIdx || status === "completed" ? "done" : i === curIdx ? "active" : "todo";
    const mark = cls === "done" ? "✓" : failed ? "✕" : (i + 1);
    return `
      <li class="flow-step ${cls}">
        <span class="flow-dot">${mark}</span>
        <span class="flow-label">${esc(label)}</span>
      </li>`;
  }).join("");

  if ($("composer-send")) $("composer-send").disabled = false;
}

function renderFocus(ws) {
  renderFocusGreeting(ws);
  renderFocusCards(ws);
  renderFocusStatus(ws);
  renderFocusFlow(ws);
}

// Composer submit → map to nearest mission → run it → drive the flow tracker.
async function submitComposer() {
  const inp = $("composer-input");
  const hint = $("composer-hint");
  const text = inp ? inp.value : "";
  if (!text.trim()) { if (inp) inp.focus(); return; }
  if (!view.ws) return;
  const hit = mapTextToTask(view.ws, text);
  if (!hit) {
    if (hint) hint.textContent = "실행할 수 있는 미션이 없습니다. ⟲ 데모 채우기로 회사를 구성하세요.";
    return;
  }
  view.selectedTaskId = hit.taskId;
  view.selectedLabel = hit.label;
  view.selectedLaneId = null;
  if (hint) hint.textContent = hit.fallback
    ? `정확히 일치하는 미션이 없어 ‘${hit.label}’ 미션을 시작합니다.`
    : `‘${hit.label}’ 미션을 시작합니다.`;
  if (inp) inp.value = "";
  renderFocus(view.ws);
  await runTask(hit.taskId);
}

// Objective card → select lane's representative mission → start its flow.
async function selectObjective(laneId) {
  if (!view.ws) return;
  const lane = (view.ws.lanes || []).find((l) => l.id === laneId);
  if (!lane) return;
  view.selectedLaneId = laneId;
  const pick = runnableTaskForLane(view.ws, lane);
  const hint = $("composer-hint");
  if (!pick) {
    view.selectedTaskId = null;
    view.selectedLabel = lane.label;
    if (hint) hint.textContent = `‘${lane.label}’ 라인에 지금 실행할 미션이 없습니다.`;
    renderFocus(view.ws);
    return;
  }
  view.selectedTaskId = pick.taskId;
  view.selectedLabel = pick.label;
  if (hint) hint.textContent = `‘${lane.label}’ 라인의 ‘${pick.label}’ 미션을 시작합니다.`;
  renderFocus(view.ws);
  await runTask(pick.taskId);
}

// ── Layer switching (focus ↔ performance/process/organization) ───────────
function setLayer(layer) {
  view.layer = layer;
  document.body.dataset.layer = layer;
  document.querySelectorAll("[data-layer-to]").forEach((b) =>
    b.classList.toggle("active", b.dataset.layerTo === layer));
  // Closing back to home dismisses any open side drawers.
  if (layer === "focus") document.body.classList.remove("insp-open", "agent-open");
  window.scrollTo({ top: 0 });
}

// Render the whole market + simulator surface from a workstream-shaped object.
function renderWorkstream(ws) {
  // Seed the client 관심 set from server watch flags exactly once.
  if (!view.watchedInit && (ws.agentPerformance || []).length) {
    view.watched = new Set((ws.agentPerformance || []).filter((p) => p.watch).map((p) => p.id));
    view.watchedInit = true;
  }
  renderMarketStatus(ws);
  renderIndices(ws);
  renderFilters(ws);
  renderPerfBoard(ws);
  renderWatchlist(ws);
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
  renderFocus(ws);
  if (document.body.classList.contains("onboard-open")) renderOnboard(ws);
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
    agentPerformance: agents.map((a, i) => ({
      id: a.id, name: a.name, role: a.role || "", lane: "", laneLabel: a.role || "",
      status: a.status || "idle", statusLabel: a.status || "idle",
      rank: i + 1, score: 60, delta: 0, deltaPercent: 0, trend: "flat",
      automationRatio: 60, humanRatio: 40, workload: 40, volume: 40,
      summary: "개요 데이터 기반 표시", watch: i < 3, runnableMissionId: null, spark: []
    })),
    market: {
      status: { code: "idle", label: "운영 대기" }, asOf: ov.generatedAt || null,
      indices: [
        { id: "active", label: "활성 에이전트", value: m.activeAgents ?? 0, unit: "", delta: 0, deltaPercent: 0, trend: "flat", spark: [] },
        { id: "queued", label: "대기 미션", value: m.queuedTasks ?? 0, unit: "건", delta: 0, deltaPercent: 0, trend: "flat", spark: [] },
        { id: "done", label: "완료 미션", value: completed, unit: "건", delta: completed, deltaPercent: 0, trend: completed ? "up" : "flat", spark: [] },
        { id: "approval", label: "승인 대기", value: pending, unit: "건", delta: -pending, deltaPercent: 0, trend: pending ? "down" : "flat", spark: [] }
      ],
      categories: []
    },
    watchlist: [],
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
  await loadSurface();   // re-renders focus flow with the task's new status
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
    renderPerfBoard(view.ws);
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
on("focus-debug", "click", () => document.body.classList.add("debug-open"));

// Layer switcher (topbar nav · bottom nav · home shortcuts · back buttons).
document.querySelectorAll("[data-layer-to]").forEach((b) =>
  b.addEventListener("click", () => setLayer(b.dataset.layerTo)));

// Goal Composer: submit on form / Enter (Shift+Enter = newline).
on("composer-form", "submit", (e) => { e.preventDefault(); submitComposer(); });
on("composer-input", "keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComposer(); }
});

// Onboarding overlay (progressive disclosure).
on("guide", "click", () => openOnboard());
on("onboard-skip", "click", () => closeOnboard(true));
on("onboard-start", "click", () => closeOnboard(true));
on("onboard-seed", "click", async () => {
  try { await request(`/api/demo/seed`, { method: "POST" }); }
  catch { setConn(false, "seed failed"); }
  await loadAll();
  if (view.ws) renderOnboard(view.ws);
});

const liveFilters = $("live-filters");
if (liveFilters) liveFilters.querySelectorAll(".lf").forEach((b) =>
  b.addEventListener("click", () => {
    view.liveFilter = b.dataset.src;
    if (view.live) renderLive(view.live);
  }));

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
    if (document.body.classList.contains("debug-open") ||
        document.body.classList.contains("insp-open") ||
        document.body.classList.contains("agent-open") ||
        document.body.classList.contains("onboard-open")) {
      document.body.classList.remove("debug-open", "insp-open", "agent-open", "onboard-open");
      closeAgentDetail();
    } else if (view.layer !== "focus") {
      setLayer("focus");
    }
  }
});

// Pause polling when the tab is hidden; resume on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopLiveTimer();
  else if (view.autoLive) { loadLive(); loadSurface(); startLiveTimer(); }
});

// boot — the Focus home IS the progressive-disclosure entry, so no overlay.
setLayer("focus");
loadAll();
startLiveTimer();
