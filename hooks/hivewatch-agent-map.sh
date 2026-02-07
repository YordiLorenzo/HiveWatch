#!/bin/bash
# HiveWatch Agent Mapping Hook
#
# Captures SubagentStart, SubagentStop, and PostToolUse(Task) events
# to build a mapping of agent short-hash IDs to team member names.
#
# Claude Code keeps this mapping in memory at runtime but never persists it.
# This hook captures the data at spawn time so HiveWatch can read it.
#
# Events are appended to ~/.claude/hivewatch/events.jsonl as single-line JSON.

set -uo pipefail

HIVEWATCH_DIR="$HOME/.claude/hivewatch"
EVENTS_FILE="$HIVEWATCH_DIR/events.jsonl"

# Ensure directory exists
mkdir -p "$HIVEWATCH_DIR" 2>/dev/null || true

# Read JSON input from stdin
INPUT=$(cat)

EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

case "$EVENT" in
  SubagentStart)
    AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')
    AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
    jq -nc \
      --arg event "start" \
      --arg agent_id "$AGENT_ID" \
      --arg session_id "$SESSION_ID" \
      --arg agent_type "$AGENT_TYPE" \
      --arg ts "$TIMESTAMP" \
      '{event:$event,agent_id:$agent_id,session_id:$session_id,agent_type:$agent_type,ts:$ts}' \
      >> "$EVENTS_FILE" 2>/dev/null
    ;;

  SubagentStop)
    AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')
    AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
    TRANSCRIPT=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')
    jq -nc \
      --arg event "stop" \
      --arg agent_id "$AGENT_ID" \
      --arg session_id "$SESSION_ID" \
      --arg agent_type "$AGENT_TYPE" \
      --arg transcript "$TRANSCRIPT" \
      --arg ts "$TIMESTAMP" \
      '{event:$event,agent_id:$agent_id,session_id:$session_id,agent_type:$agent_type,transcript_path:$transcript,ts:$ts}' \
      >> "$EVENTS_FILE" 2>/dev/null
    ;;

  PostToolUse)
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
    if [ "$TOOL_NAME" = "Task" ]; then
      MEMBER_NAME=$(echo "$INPUT" | jq -r '.tool_input.name // empty')
      TEAM_NAME=$(echo "$INPUT" | jq -r '.tool_input.team_name // empty')
      SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')
      DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // empty')
      RESPONSE_AGENT_ID=$(echo "$INPUT" | jq -r '(.tool_response.agentId // .tool_response.agent_id) // empty')

      # Only log team member spawns (have team_name) and regular subagent spawns
      jq -nc \
        --arg event "task_spawn" \
        --arg session_id "$SESSION_ID" \
        --arg member_name "$MEMBER_NAME" \
        --arg team_name "$TEAM_NAME" \
        --arg subagent_type "$SUBAGENT_TYPE" \
        --arg description "$DESCRIPTION" \
        --arg response_agent_id "$RESPONSE_AGENT_ID" \
        --arg ts "$TIMESTAMP" \
        '{event:$event,session_id:$session_id,member_name:$member_name,team_name:$team_name,subagent_type:$subagent_type,description:$description,response_agent_id:$response_agent_id,ts:$ts}' \
        >> "$EVENTS_FILE" 2>/dev/null
    fi
    ;;
esac

# Always exit 0 — never block Claude Code
exit 0
