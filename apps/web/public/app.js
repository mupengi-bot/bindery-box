// API base resolution order:
//   1. window.__BINDERY_API_BASE__  (env-injected config.js — cloud deploys)
//   2. window.BINDERY_API_URL       (legacy override)
//   3. same-origin "" when served from a real host (Vercel)
//   4. http://localhost:4311        (local default)
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
async function request(path, options = {}) { const res = await fetch(`${api}${path}`, options); if (!res.ok) throw new Error(await res.text()); return res.json(); }
function metric(label, value, hint) { return `<div class="metric"><span>${label}</span><strong>${value}</strong><span>${hint ?? ""}</span></div>`; }
function render(overview) {
  const m = overview.metrics;
  $("metrics").innerHTML = [
    metric("Active Agents", m.activeAgents, "로컬 팀원"),
    metric("Queued Tasks", m.queuedTasks, "대기 업무"),
    metric("Pending Approvals", m.pendingApprovals, "승인 필요"),
    metric("Completed", m.completedTasks, "완료 업무")
  ].join("");
  $("agents").innerHTML = overview.agents.map((agent) => `<article class="card"><div class="item-row"><h3>${agent.name}</h3><b class="status">${agent.status}</b></div><p class="muted">${agent.role} · ${agent.channel}</p><p>${agent.kpi}</p><div>${(agent.capabilities || []).map((cap) => `<span class="pill">${cap}</span>`).join("")}</div></article>`).join("");
  $("tasks").innerHTML = overview.tasks.map((task) => `<article class="item"><div class="item-row"><h3>${task.title}</h3><span class="pill">${task.status}</span></div><p class="muted">${task.category} · ${task.priority} · ${task.source}</p>${task.output ? `<p>${task.output}</p>` : ""}<button data-run="${task.id}" ${task.status === "completed" ? "disabled" : ""}>Run Task</button></article>`).join("");
  $("approvals").innerHTML = overview.approvals.length ? overview.approvals.map((approval) => `<article class="item"><div class="item-row"><h3>${approval.title}</h3><span class="pill">${approval.status}</span></div><p>${approval.summary}</p><button data-approve="${approval.id}" ${approval.status !== "pending" ? "disabled" : ""}>Approve</button></article>`).join("") : `<p class="muted">아직 승인 요청이 없습니다.</p>`;
  $("audit").innerHTML = overview.auditEvents.map((event) => `<div class="event"><b>${event.action}</b> · ${event.actor}<br/><span class="muted">${event.ts}</span><br/>${event.message}</div>`).join("");
  const office = overview.officeEvents || [];
  $("office").innerHTML = office.length ? office.map((post) => `<div class="event"><b>${post.channelRef}</b> · ${post.provider}<br/><span class="muted">${post.postedAt}</span><br/>${post.text}</div>`).join("") : `<p class="muted">아직 오피스 이벤트가 없습니다.</p>`;
  document.querySelectorAll("[data-run]").forEach((button) => button.addEventListener("click", async () => { await request(`/api/tasks/${button.dataset.run}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestedBy: "mission-control" }) }); await load(); }));
  document.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", async () => { await request(`/api/approvals/${button.dataset.approve}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approved", decidedBy: "mission-control" }) }); await load(); }));
}
async function load() { try { render(await request(`/api/workspaces/${workspace}/overview`)); } catch (error) { $("audit").innerHTML = `<p class="error">API 연결 실패: ${error.message}</p>`; } }
$("refresh").addEventListener("click", load);
$("seed").addEventListener("click", async () => { await request("/api/demo/seed", { method: "POST" }); await load(); });
load();
