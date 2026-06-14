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
    capabilities: ["github.repo.read", "github.issue.create", "github.pr.review", "github.pr.create"],
    configSchema: { org: { type: "string", required: true }, repo: { type: "string", required: false } },
    secretRequirements: ["githubTokenRef"]
  },
  {
    id: "mattermost",
    name: "Mattermost",
    version: "0.1.0",
    category: "communication",
    capabilities: ["mattermost.thread.read", "mattermost.thread.post", "mattermost.slash-command.receive"],
    configSchema: { baseUrl: { type: "string", required: true }, team: { type: "string", required: true } },
    secretRequirements: ["mattermostBotTokenRef", "mattermostSigningSecretRef"]
  },
  {
    id: "paperclip",
    name: "Paperclip / OpenClaw Gateway",
    version: "0.1.0",
    category: "orchestration",
    capabilities: ["paperclip.ticket.create", "paperclip.run.start", "openclaw.gateway.stream"],
    configSchema: { gatewayUrl: { type: "string", required: true }, workspaceRef: { type: "string", required: true } },
    secretRequirements: ["paperclipApiKeyRef", "openclawGatewayTokenRef"]
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
