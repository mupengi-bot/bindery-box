// @bindery-box/connectors
// Connector Hub: reusable integration manifests + capability mapping only.
// Manifests describe how the platform *could* integrate; they never carry
// tenant credentials. secretRequirements list named refs, not values.
// (docs/architecture/domain-model.md "Connector" rules.)

export const CONNECTOR_MANIFESTS = Object.freeze([
  {
    id: "file",
    name: "Local Files",
    version: "0.1.0",
    category: "storage",
    capabilities: ["files.read", "files.write"],
    configSchema: { rootPath: { type: "string", required: true } },
    secretRequirements: []
  },
  {
    id: "csv",
    name: "CSV Import",
    version: "0.1.0",
    category: "import",
    capabilities: ["files.read", "csv.import"],
    configSchema: { importFolder: { type: "string", required: true } },
    secretRequirements: []
  },
  {
    id: "email",
    name: "Email",
    version: "0.1.0",
    category: "communication",
    capabilities: ["email.draft", "email.send"],
    configSchema: { fromAddress: { type: "string", required: true } },
    secretRequirements: ["smtpCredentialRef"]
  },
  {
    id: "github",
    name: "GitHub",
    version: "0.1.0",
    category: "devtools",
    capabilities: ["github.repo.read", "github.issue.create"],
    configSchema: { org: { type: "string", required: true }, repo: { type: "string", required: false } },
    secretRequirements: ["githubTokenRef"]
  },
  {
    id: "erp-mes",
    name: "ERP / MES",
    version: "0.1.0",
    category: "manufacturing",
    capabilities: ["erp.order.read", "erp.order.write", "mes.production.read"],
    configSchema: { baseUrl: { type: "string", required: true }, plantId: { type: "string", required: false } },
    secretRequirements: ["erpApiKeyRef"]
  },
  {
    id: "webhook",
    name: "Webhook",
    version: "0.1.0",
    category: "integration",
    capabilities: ["webhook.receive", "webhook.send"],
    configSchema: { endpoint: { type: "string", required: true } },
    secretRequirements: ["webhookSigningSecretRef"]
  },
  {
    id: "mcp",
    name: "MCP Tools",
    version: "0.1.0",
    category: "integration",
    capabilities: ["mcp.tool.call"],
    configSchema: { serverRef: { type: "string", required: true } },
    secretRequirements: ["mcpAuthRef"]
  }
]);

export function listConnectors() {
  return CONNECTOR_MANIFESTS.map((c) => ({ ...c }));
}

export function getConnector(id) {
  const found = CONNECTOR_MANIFESTS.find((c) => c.id === id);
  return found ? { ...found } : null;
}

// capability -> [connectorId, ...]
export function buildCapabilityMap() {
  const map = {};
  for (const connector of CONNECTOR_MANIFESTS) {
    for (const capability of connector.capabilities) {
      (map[capability] ??= []).push(connector.id);
    }
  }
  return map;
}

export function capabilitiesFor(connectorId) {
  return getConnector(connectorId)?.capabilities ?? [];
}

export function connectorsForCapability(capability) {
  return buildCapabilityMap()[capability] ?? [];
}
