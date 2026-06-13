"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Connector, GoldenImage, KnowledgeResult, LiveLog, RoleTemplate, Workstream } from "./types";

const WS = "default";
const POLL_MS = 6000;
export type CreateAgentInput = { name: string; role: string; lane: string; templateId?: string; persona?: string; prompt?: string; capabilities?: string[]; kpi?: string };
export type CreateTaskInput = { title: string; lane: string; priority?: string; requiresApproval?: boolean; expectedOutput?: string; enqueue?: boolean };
export type MoveAgentInput = { agentId: string; x: number; z: number; source?: "floor" | "zone" };

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export interface OfficeData {
  workstream: Workstream | null;
  liveLog: LiveLog | null;
  connectors: Connector[];
  goldenImage: GoldenImage | null;
  roleTemplates: RoleTemplate[];
  loading: boolean;
  error: string | null;
  /** Refresh workstream + live-log immediately. */
  refresh: () => Promise<void>;
  /** Create a zone/task work request, then refresh. */
  createTask: (input: CreateTaskInput) => Promise<void>;
  /** Persist an agent movement command, then refresh. */
  moveAgent: (input: MoveAgentInput) => Promise<void>;
  /** Run a task (mission) by id, then refresh. */
  runMission: (taskId: string) => Promise<void>;
  /** Decide an approval, then refresh. */
  decideApproval: (approvalId: string, decision: "approved" | "rejected") => Promise<void>;
  /** Create a demo office agent/person, then refresh. */
  createAgent: (input: CreateAgentInput) => Promise<void>;
  /** Reseed the demo company. */
  reseed: () => Promise<void>;
  /** One-off knowledge graph search. */
  searchKnowledge: (q: string) => Promise<KnowledgeResult[]>;
}

export function useOfficeData(): OfficeData {
  const [workstream, setWorkstream] = useState<Workstream | null>(null);
  const [liveLog, setLiveLog] = useState<LiveLog | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [goldenImage, setGoldenImage] = useState<GoldenImage | null>(null);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [ws, log, golden] = await Promise.all([
        getJSON<Workstream>(`/api/workspaces/${WS}/workstream`),
        getJSON<LiveLog>(`/api/workspaces/${WS}/live-log`),
        getJSON<GoldenImage>(`/api/workspaces/${WS}/golden-image`),
      ]);
      if (!mounted.current) return;
      setWorkstream(ws);
      setLiveLog(log);
      setGoldenImage(golden);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    getJSON<{ connectors: Connector[] }>("/api/connectors")
      .then((d) => mounted.current && setConnectors(d.connectors ?? []))
      .catch(() => {});
    getJSON<{ templates: RoleTemplate[] }>("/api/role-templates")
      .then((d) => mounted.current && setRoleTemplates(d.templates ?? []))
      .catch(() => {});
    const t = setInterval(refresh, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, [refresh]);


  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      await fetch(`/api/workspaces/${WS}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, requestedBy: "operator" }),
      });
      await refresh();
    },
    [refresh],
  );

  const moveAgent = useCallback(
    async (input: MoveAgentInput) => {
      await fetch(`/api/agents/${input.agentId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x: input.x, z: input.z, source: input.source ?? "floor", requestedBy: "operator" }),
      });
      await refresh();
    },
    [refresh],
  );

  const runMission = useCallback(
    async (taskId: string) => {
      await fetch(`/api/tasks/${taskId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestedBy: "operator" }),
      });
      await refresh();
    },
    [refresh],
  );

  const decideApproval = useCallback(
    async (approvalId: string, decision: "approved" | "rejected") => {
      await fetch(`/api/approvals/${approvalId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, decidedBy: "operator" }),
      });
      await refresh();
    },
    [refresh],
  );


  const createAgent = useCallback(
    async (input: CreateAgentInput) => {
      await fetch(`/api/workspaces/${WS}/agents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, requestedBy: "operator" }),
      });
      await refresh();
    },
    [refresh],
  );

  const reseed = useCallback(async () => {
    await fetch(`/api/demo/seed`, { method: "POST" });
    await refresh();
  }, [refresh]);

  const searchKnowledge = useCallback(async (q: string): Promise<KnowledgeResult[]> => {
    const d = await getJSON<{ results: KnowledgeResult[] }>(
      `/api/knowledge/search?q=${encodeURIComponent(q)}`,
    );
    return d.results ?? [];
  }, []);

  return {
    workstream,
    liveLog,
    connectors,
    goldenImage,
    roleTemplates,
    loading,
    error,
    refresh,
    createTask,
    moveAgent,
    runMission,
    decideApproval,
    createAgent,
    reseed,
    searchKnowledge,
  };
}
