// @bindery-box/knowledge
// Knowledge Graph: demo documents, nodes, and edges plus a small token-overlap
// search. All content is synthetic demo data — no PII, no real logs.
import { makeId, nowIso } from "../../domain/src/index.mjs";

export const NodeType = Object.freeze({
  customer: "customer",
  supplier: "supplier",
  productionLine: "production_line",
  order: "order",
  risk: "risk"
});

// Build a small in-memory knowledge graph for the manufacturing edition demo.
export function createKnowledgeBase(workspaceId = "ws_default") {
  const createdAt = nowIso();
  const doc = (sourceRef, title, body) => ({
    id: makeId("doc"),
    workspaceId,
    sourceType: "csv",
    sourceRef,
    title,
    body,
    status: "ingested",
    createdAt
  });

  const documents = [
    doc("examples/manufacturing-demo/data/production_daily.csv", "생산일보 요약",
      "라인 2 원자재 입고 지연으로 납기 위험. 라인 1 정상 가동. 설비 점검 대기 1건."),
    doc("examples/manufacturing-demo/data/orders.csv", "견적/수주 현황",
      "고객 A, B, C 견적 미응답. 고객 A 재문의 가능성 높음. 후속 메시지 필요."),
    doc("examples/manufacturing-demo/data/scope3_suppliers.csv", "Scope 3 공급망 데이터",
      "공급사 4곳 배출계수 및 전력사용량 데이터 누락. ESG 자료 요청 필요.")
  ];

  const [prodDoc, salesDoc, scope3Doc] = documents;

  const node = (documentId, nodeType, title, properties) => ({
    id: makeId("node"),
    workspaceId,
    documentId,
    nodeType,
    title,
    properties: properties ?? {}
  });

  const nodes = [
    node(prodDoc.id, NodeType.productionLine, "Line 2", { status: "at_risk", cause: "material_delay" }),
    node(prodDoc.id, NodeType.risk, "납기 위험 - Line 2", { severity: "high" }),
    node(salesDoc.id, NodeType.customer, "Customer A", { stage: "quote_followup", priority: "high" }),
    node(salesDoc.id, NodeType.order, "Quote A-1029", { status: "no_response" }),
    node(scope3Doc.id, NodeType.supplier, "Supplier S-04", { missing: ["emission_factor", "electricity_usage"] }),
    node(scope3Doc.id, NodeType.risk, "Scope 3 데이터 누락", { severity: "medium" })
  ];

  const edge = (fromId, toId, relation) => ({ id: makeId("edge"), workspaceId, fromId, toId, relation });

  const nodeByTitle = (title) => nodes.find((n) => n.title === title);
  const edges = [
    edge(nodeByTitle("Line 2").id, nodeByTitle("납기 위험 - Line 2").id, "has_risk"),
    edge(nodeByTitle("Customer A").id, nodeByTitle("Quote A-1029").id, "owns_order"),
    edge(nodeByTitle("Supplier S-04").id, nodeByTitle("Scope 3 데이터 누락").id, "has_risk")
  ];

  return { workspaceId, documents, nodes, edges };
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[\s,.;:!?·\/()[\]{}"']+/u)
    .filter(Boolean);
}

// Token-overlap search across documents and nodes. Returns ranked hits.
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
    const s = score(`${node.title} ${node.nodeType} ${JSON.stringify(node.properties)}`);
    if (s > 0) hits.push({ kind: "node", id: node.id, title: node.title, nodeType: node.nodeType, score: s });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Outgoing relations for a node, resolving target titles.
export function neighbors(kb, nodeId) {
  return kb.edges
    .filter((e) => e.fromId === nodeId)
    .map((e) => ({
      relation: e.relation,
      target: kb.nodes.find((n) => n.id === e.toId) ?? null
    }));
}
