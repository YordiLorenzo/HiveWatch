import * as fs from "fs";
import { HIVEWATCH_EVENTS_FILE } from "../constants.js";

export interface HookEvent {
  event: string;
  agent_id?: string;
  session_id?: string;
  agent_type?: string;
  member_name?: string;
  team_name?: string;
  transcript_path?: string;
  response_agent_id?: string;
  description?: string;
  ts: string;
}

export interface HookAgentMapping {
  memberName: string;
  teamName: string;
  transcriptPath?: string;
}

/** Standard agent types that don't represent team members */
const STANDARD_AGENT_TYPES = new Set(["general-purpose", "Explore", "Plan", "Bash"]);

export function normalizeAgentId(id: string): string {
  return id.startsWith("agent-") ? id.slice(6) : id;
}

let hookMappingCache: { map: Map<string, HookAgentMapping>; builtAt: number } | null = null;

/**
 * Load agent mappings from hook event log.
 * Correlates SubagentStart (has agent_id) with PostToolUse/Task (has member_name)
 * by session_id and temporal proximity to build agentHash -> memberName map.
 */
export function getHookMappings(): Map<string, HookAgentMapping> {
  if (hookMappingCache && Date.now() - hookMappingCache.builtAt < 30_000) {
    return hookMappingCache.map;
  }

  const map = new Map<string, HookAgentMapping>();

  try {
    if (!fs.existsSync(HIVEWATCH_EVENTS_FILE)) {
      hookMappingCache = { map, builtAt: Date.now() };
      return map;
    }

    const content = fs.readFileSync(HIVEWATCH_EVENTS_FILE, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const events: HookEvent[] = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch { continue; }
    }

    const startsBySession = new Map<string, HookEvent[]>();
    const spawnsBySession = new Map<string, HookEvent[]>();
    const transcriptPaths = new Map<string, string>();

    for (const evt of events) {
      const sid = evt.session_id || "";
      if (evt.event === "start" && evt.agent_id) {
        const list = startsBySession.get(sid) || [];
        list.push(evt);
        startsBySession.set(sid, list);

        if (evt.agent_type && !STANDARD_AGENT_TYPES.has(evt.agent_type)) {
          const agentId = normalizeAgentId(evt.agent_id);
          if (!map.has(agentId)) {
            map.set(agentId, {
              memberName: evt.agent_type,
              teamName: "",
              transcriptPath: transcriptPaths.get(agentId),
            });
          }
        }
      } else if (evt.event === "task_spawn" && evt.team_name && evt.member_name) {
        const list = spawnsBySession.get(sid) || [];
        list.push(evt);
        spawnsBySession.set(sid, list);
      } else if (evt.event === "stop" && evt.agent_id && evt.transcript_path) {
        transcriptPaths.set(normalizeAgentId(evt.agent_id), evt.transcript_path);
      }
    }

    // Correlate start + task_spawn by session + timestamp proximity
    for (const [sessionId, starts] of startsBySession) {
      const spawns = spawnsBySession.get(sessionId) || [];
      if (spawns.length === 0) continue;

      starts.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      spawns.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

      const usedSpawns = new Set<number>();

      for (const start of starts) {
        const startTime = new Date(start.ts).getTime();
        let bestIdx = -1;
        let bestDelta = Infinity;

        for (let i = 0; i < spawns.length; i++) {
          if (usedSpawns.has(i)) continue;
          const delta = Math.abs(new Date(spawns[i].ts).getTime() - startTime);
          if (delta < bestDelta && delta < 30_000) {
            bestDelta = delta;
            bestIdx = i;
          }
        }

        if (bestIdx >= 0) {
          usedSpawns.add(bestIdx);
          const spawn = spawns[bestIdx];
          const agentId = normalizeAgentId(start.agent_id!);
          map.set(agentId, {
            memberName: spawn.member_name!,
            teamName: spawn.team_name!,
            transcriptPath: transcriptPaths.get(agentId),
          });
        }
      }
    }
  } catch {
    // Events file missing or corrupt — return empty map
  }

  hookMappingCache = { map, builtAt: Date.now() };
  return map;
}

export function clearHookMappingCache(): void {
  hookMappingCache = null;
}
