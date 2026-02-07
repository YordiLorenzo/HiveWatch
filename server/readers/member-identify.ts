import * as fs from "fs";

function isToolUseBlock(
  b: unknown,
): b is { type: "tool_use"; name: string; input: Record<string, unknown> } {
  return (
    typeof b === "object" &&
    b !== null &&
    (b as { type?: string }).type === "tool_use" &&
    typeof (b as { name?: unknown }).name === "string"
  );
}

/**
 * Read first N lines of a JSONL file and return parsed entries.
 */
export function readFirstLines(filePath: string, maxLines: number): Record<string, unknown>[] {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (bytesRead === 0) return [];

    const text = buf.toString("utf-8", 0, bytesRead);
    const lines = text.split("\n").filter(Boolean).slice(0, maxLines);
    const entries: Record<string, unknown>[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // partial line from buffer boundary — skip
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Identify which team member a JSONL file belongs to.
 * Returns member name or null if unmapped (sub-agent).
 *
 * Strategies (in priority order):
 * 1. TaskUpdate with owner matching a member name (in assistant messages)
 * 2. SendMessage shutdown_response with @member-name in request_id
 * 3. shutdown_request with @member-name in first user message
 * 4. "You are <name>" or name="<name>" in first message content
 * 5. Member name appears in teammate-message body (excluding sender)
 */
export function identifyMember(
  filePath: string,
  memberNames: Set<string>,
): string | null {
  const entries = readFirstLines(filePath, 15);

  // Strategy 1 & 2: Check assistant tool_use blocks
  for (const entry of entries) {
    if ((entry as { type?: string }).type !== "assistant") continue;
    const content = (entry as { message?: { content?: unknown[] } }).message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!isToolUseBlock(block)) continue;

      if (block.name === "TaskUpdate") {
        const owner = block.input?.owner;
        if (typeof owner === "string" && memberNames.has(owner)) return owner;
      }

      if (block.name === "SendMessage") {
        const reqId = String(block.input?.request_id || "");
        const match = reqId.match(/@([\w-]+)/);
        if (match && memberNames.has(match[1])) return match[1];
      }
    }
  }

  // Strategy 3, 4, 5: Check user messages (especially first message)
  for (const entry of entries) {
    if ((entry as { type?: string }).type !== "user") continue;
    const content = (entry as { message?: { content?: string } }).message?.content;
    if (typeof content !== "string") continue;

    // Strategy 3: shutdown_request with @member-name
    const shutdownMatch = content.match(/shutdown-\d+@([\w-]+)/);
    if (shutdownMatch && memberNames.has(shutdownMatch[1])) return shutdownMatch[1];

    // Strategy 4: Explicit name references
    for (const name of memberNames) {
      if (
        content.includes(`You are ${name}`) ||
        content.includes(`name="${name}"`) ||
        content.includes(`You are the ${name}`)
      ) {
        return name;
      }
    }

    // Strategy 5: Member name in message body (case-insensitive, excluding sender)
    if (content.includes("<teammate-message")) {
      const senderMatch = content.match(/teammate_id="([\w-]+)"/);
      const sender = senderMatch ? senderMatch[1] : "";

      const tagEnd = content.indexOf(">");
      const body = tagEnd > 0 ? content.slice(tagEnd + 1, tagEnd + 600) : content.slice(0, 600);
      const bodyLower = body.toLowerCase();

      for (const name of memberNames) {
        if (name !== sender && bodyLower.includes(name)) {
          return name;
        }
      }
    }
  }

  return null;
}
