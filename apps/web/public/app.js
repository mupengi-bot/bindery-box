const api = window.BINDERY_API_URL || "http://localhost:4311";
const $ = (id) => document.getElementById(id);
async function request(path, options = {}) { const res = await fetch(`${api}${path}`, options); if (!res.ok) throw new Error(await res.text()); return res.json(); }
function metric(label, value, hint) { return `<div class="metric"><span>${label}</span><strong>${value}</strong><span>${hint ?? ""}</span></div>`; }
function render(state) {
  $("metrics").innerHTML = [
    metric("Active Agents", state.metrics.activeAgents, "로컬 팀원"),
    metric("Queued Tasks", state.metrics.queuedTasks, "대기 업무"),
    metric("Pending Approvals", state.metrics.pendingApprovals, "승인 필요"),
    metric("Completed", state.metrics.completedTasks, "완료 업무")
  ].join("");
  $("agents").innerHTML = state.agents.map((agent) => `<article class="card"><div class="item-row"><h3>${agent.name}</h3><b class="status">${agent.status}</b></div><p class="muted">${agent.role} · ${agent.channel}</p><p>${agent.kpi}</p><div>${agent.capabilities.map((cap) => `<span class="pill">${cap}</span>`).join("")}</div></article>`).join("");
  $("tasks").innerHTML = state.tasks.map((task) => `<article class="item"><div class="item-row"><h3>${task.title}</h3><span class="pill">${task.status}</span></div><p class="muted">${task.category} · ${task.priority} · ${task.source}</p>${task.output ? `<p>${task.output}</p>` : ""}<button data-run="${task.id}" ${task.status === "completed" ? "disabled" : ""}>Run Task</button></article>`).join("");
  $("approvals").innerHTML = state.approvals.length ? state.approvals.map((approval) => `<article class="item"><div class="item-row"><h3>${approval.title}</h3><span class="pill">${approval.status}</span></div><p>${approval.summary}</p><button data-approve="${approval.id}" ${approval.status !== "pending" ? "disabled" : ""}>Approve</button></article>`).join("") : `<p class="muted">아직 승인 요청이 없습니다.</p>`;
  $("audit").innerHTML = state.auditEvents.map((event) => `<div class="event"><b>${event.action}</b> · ${event.actor}<br/><span class="muted">${event.ts}</span><br/>${event.message}</div>`).join("");
  document.querySelectorAll("[data-run]").forEach((button) => button.addEventListener("click", async () => { await request(`/tasks/${button.dataset.run}/run`, { method: "POST" }); await load(); }));
  document.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", async () => { await request(`/approvals/${button.dataset.approve}/approve`, { method: "POST" }); await load(); }));
}
async function load() { try { render(await request("/state")); } catch (error) { $("audit").innerHTML = `<p class="error">API 연결 실패: ${error.message}</p>`; } }
$("refresh").addEventListener("click", load);
$("seed").addEventListener("click", async () => { await request("/demo/seed", { method: "POST" }); await load(); });
load();
