import { describe, it, expect } from 'vitest';
import { OperatorRole } from '@prisma/client';
import { roleAtLeast } from '@/lib/operator-role';
import { getToolMap, callTool, ToolForbiddenError } from '@/lib/mcp/registry';
import type { McpContext } from '@/lib/mcp/types';

// MCP write-path role gate (overnight security audit, CRITICAL #2). Before this
// gate, any authenticated org member — including a READ_ONLY-floor member — could
// POST /api/mcp tools/call and run STAFF/ADMIN-equivalent mutations, bypassing
// the entire REST `requireRole` boundary. The registry now DEFAULT-DENIES: a tool
// with no declared `minRole` requires STAFF, and only read tools opt down to
// READ_ONLY. This test is the runtime guard for that invariant.

// The typed `nobc_*` read tools. Everything else typed is a write and must NOT
// be reachable at READ_ONLY (this is exactly where `nobc_tag_member` used to
// leak — it is destructive:false but mutates, so it must require STAFF).
const TYPED_READS = new Set([
  'nobc_get_members',
  'nobc_get_member',
  'nobc_get_applications',
  'nobc_get_application',
  'nobc_get_events',
  'nobc_get_event',
  'nobc_get_rsvps',
  'nobc_get_rsvp',
  'nobc_get_checkin_status',
]);

// Legacy reads are the intelligence.* family plus any *.list / *.get accessor
// (mirrors the NON_DESTRUCTIVE predicate in legacy-tools.ts). Intelligence tools
// are generated dynamically, so the set is expressed as a predicate, not a list.
function isExpectedRead(name: string): boolean {
  if (TYPED_READS.has(name)) return true;
  return /^intelligence\.|\.list$|\.get$/.test(name);
}

function ctx(role: OperatorRole): McpContext {
  return { userId: 'user_test', workspaceId: 'ws_test', role };
}

describe('MCP role gate', () => {
  const tools = [...getToolMap().values()];

  it('registers tools (sanity)', () => {
    expect(tools.length).toBeGreaterThan(10);
  });

  it('a READ_ONLY caller can reach exactly the read tools — never a write', () => {
    for (const tool of tools) {
      const required = tool.minRole ?? OperatorRole.STAFF;
      const reachableAtReadOnly = roleAtLeast(OperatorRole.READ_ONLY, required);
      expect(reachableAtReadOnly, `${tool.name} READ_ONLY reachability`).toBe(
        isExpectedRead(tool.name),
      );
    }
  });

  it('every write tool requires at least STAFF', () => {
    for (const tool of tools) {
      if (isExpectedRead(tool.name)) continue;
      const required = tool.minRole ?? OperatorRole.STAFF;
      expect(roleAtLeast(OperatorRole.STAFF, required), `${tool.name} STAFF can write`).toBe(true);
    }
  });

  it('nobc_tag_member is gated despite destructive:false (regression)', () => {
    const tagMember = getToolMap().get('nobc_tag_member');
    expect(tagMember).toBeDefined();
    expect(tagMember!.destructive).toBe(false); // it is a UX hint, not auth
    expect(tagMember!.minRole ?? OperatorRole.STAFF).toBe(OperatorRole.STAFF);
  });

  it('rejects a write at READ_ONLY before the handler runs (no DB touched)', async () => {
    // The gate throws ToolForbiddenError ahead of schema-parse and the handler,
    // so this never reaches the database even with empty args.
    await expect(callTool('nobc_tag_member', ctx(OperatorRole.READ_ONLY), {})).rejects.toBeInstanceOf(
      ToolForbiddenError,
    );
    await expect(callTool('nobc_create_event', ctx(OperatorRole.READ_ONLY), {})).rejects.toBeInstanceOf(
      ToolForbiddenError,
    );
    await expect(
      callTool('nobc_approve_application', ctx(OperatorRole.READ_ONLY), {}),
    ).rejects.toBeInstanceOf(ToolForbiddenError);
  });
});
