// @bindery-box/knowledge
// Knowledge Graph: demo documents, nodes, and edges plus a small token-overlap
// search. All content is synthetic demo data — no PII, no real logs.
import { makeId, nowIso } from "../../domain/src/index.mjs";

export const NodeType = Object.freeze({
  document: "document",
  issue: "issue",
  pullRequest: "pull_request",
  contract: "contract",
  incident: "incident",
  customer: "customer",
  risk: "risk"
});

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}#./_-]+/u)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Build a small in-memory knowledge graph for the generic AI Company Office.
export function createKnowledgeBase(workspaceId = "ws_default") {
  const doc = (id, title, body) => ({ id, workspaceId, type: NodeType.document, title, body });
  const documents = [
    doc("github://mupengi-bot/bindery-box/issues", "GitHub 이슈/PR triage",
      "열린 이슈와 PR, CI 실패, 리뷰 대기 상태를 모아 Engineering Operator가 우선순위와 다음 액션을 정리합니다."),
    doc("mattermost://legal/contract-review", "계약서 검토 요청",
      "Mattermost 법무 스레드에서 계약서 위험 조항 검토 요청이 들어오면 Legal Reviewer가 조항별 위험도와 수정안을 작성합니다."),
    doc("mattermost://operations/incident", "운영 인시던트 스레드",
      "운영 채널 인시던트 요청은 런북, 영향 범위, 고객 응답 초안으로 정리되어 같은 스레드에 돌아갑니다.")
  ];

  const [githubDoc, legalDoc, opsDoc] = documents;
  const node = (docId, type, label, meta = {}) => ({ id: `${type}:${label}`, workspaceId, type, label, docId, meta });
  const nodes = [
    node(githubDoc.id, NodeType.issue, "Issue triage queue", { lane: "engineering", priority: "high" }),
    node(githubDoc.id, NodeType.pullRequest, "PR review boundary", { approval: "before_push_or_pr_create" }),
    node(legalDoc.id, NodeType.contract, "Contract risk review", { lane: "legal", approval: "before_external_send" }),
    node(legalDoc.id, NodeType.risk, "Ambiguous liability clause", { severity: "medium" }),
    node(opsDoc.id, NodeType.incident, "Mattermost incident intake", { lane: "operations", source: "mattermost" }),
    node(opsDoc.id, NodeType.customer, "Customer-facing reply draft", { approval: "before_external_notice" })
  ];
  const nodeByTitle = (label) => nodes.find((n) => n.label === label);
  const edge = (from, to, rel) => ({ id: `${from}->${to}:${rel}`, workspaceId, from, to, rel });
  const edges = [
    edge(nodeByTitle("Issue triage queue").id, nodeByTitle("PR review boundary").id, "may_create"),
    edge(nodeByTitle("Contract risk review").id, nodeByTitle("Ambiguous liability clause").id, "has_risk"),
    edge(nodeByTitle("Mattermost incident intake").id, nodeByTitle("Customer-facing reply draft").id, "produces")
  ];

  return { workspaceId, documents, nodes, edges };
}

export function searchKnowledge(kb, query, limit = 5) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const score = (text) => {
    const haystack = new Set(tokenize(text));
    return queryTokens.reduce((acc, token) => acc + (haystack.has(token) ? 1 : 0), 0);
  };

  const hits = [];
  for (const document of kb.documents) {
    const s = score(`${document.title} ${document.body}`);
    if (s > 0) hits.push({ kind: "document", id: document.id, title: document.title, score: s, ref: document.sourceRef });
  }
  for (const node of kb.nodes) {
    const s = score(`${node.label} ${node.type} ${JSON.stringify(node.meta ?? {})}`);
    if (s > 0) hits.push({ kind: "node", id: node.id, title: node.label, nodeType: node.type, score: s });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Outgoing relations for a node, resolving target labels.
export function neighbors(kb, nodeId) {
  return kb.edges
    .filter((e) => e.from === nodeId)
    .map((e) => ({
      relation: e.rel,
      target: kb.nodes.find((n) => n.id === e.to) ?? null
    }));
}
