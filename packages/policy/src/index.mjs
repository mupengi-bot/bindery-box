// @bindery-box/policy
// Capability + approval policy engine. Runtime must evaluate policy BEFORE any
// side effect (docs/architecture/platform-first-architecture.md "Platform
// Invariant"). The engine is pure: state in, decision out, no mutation.
import { SENSITIVE_CAPABILITIES } from "../../domain/src/index.mjs";

export const Decision = Object.freeze({
  allow: "allow",
  requireApproval: "require_approval",
  block: "block"
});

// Evaluate whether an agent may run a task.
// Returns { decision, capabilities, missing, sensitive, reason }.
export function evaluateTaskRun(task, agent, options = {}) {
  const sensitiveSet = new Set(options.sensitiveCapabilities ?? SENSITIVE_CAPABILITIES);
  const required = task.requiredCapabilities ?? [];
  const granted = new Set(agent?.capabilityGrants ?? []);

  const missing = required.filter((cap) => !granted.has(cap));
  if (missing.length > 0) {
    return {
      decision: Decision.block,
      capabilities: required,
      missing,
      sensitive: [],
      reason: `에이전트에 필요한 권한이 없음: ${missing.join(", ")}`
    };
  }

  const sensitive = required.filter((cap) => sensitiveSet.has(cap));
  // A task can also be flagged for approval explicitly in the domain.
  if (sensitive.length > 0 || task.requiresApproval) {
    return {
      decision: Decision.requireApproval,
      capabilities: required,
      missing: [],
      sensitive,
      reason: sensitive.length > 0
        ? `민감 권한 사용으로 승인 필요: ${sensitive.join(", ")}`
        : "정책상 승인 필요 작업"
    };
  }

  return {
    decision: Decision.allow,
    capabilities: required,
    missing: [],
    sensitive: [],
    reason: "권한 충족, 승인 불필요"
  };
}

export const defaultPolicy = Object.freeze({ evaluateTaskRun });
