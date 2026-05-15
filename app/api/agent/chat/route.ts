import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

const SYSTEM = `You are the NoBC OS operator assistant. You help the operator manage their member club — applications, events, RSVPs, and guest lists.

You have access to the NoBC OS MCP tools at /api/mcp. To call a tool, respond with a JSON code block in this format:
\`\`\`tool
{"tool": "list_members", "args": {}}
\`\`\`

Available tools: list_members, get_member, list_events, get_event, list_rsvps, list_applications, get_application, add_to_red_list.

Keep responses concise and actionable. Never fabricate member data.`;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  await requireWorkspaceId(userId);

  const { messages } = (await req.json()) as { messages: { role: string; content: string }[] };
  if (!messages?.length) return new Response('messages required', { status: 400 });

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM,
    messages: messages as NonNullable<Parameters<typeof streamText>[0]['messages']>,
  });

  return result.toTextStreamResponse();
}
