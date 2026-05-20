import { db } from './db';

type CommentLike = {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  body: string;
  mentions: string[];
};

function entityLink(entityType: string, entityId: string): string {
  if (entityType === 'application') return `/operator/applications/${entityId}`;
  if (entityType === 'member') return `/operator/members/${entityId}`;
  if (entityType === 'event') return `/operator/events/${entityId}`;
  return `/operator`;
}

export async function notifyMentions({
  workspaceId,
  comment,
  authorName,
}: {
  workspaceId: string;
  comment: CommentLike;
  authorName: string;
}): Promise<void> {
  const recipients = comment.mentions.filter((r) => r !== comment.authorId);
  if (recipients.length === 0) return;
  await db.operatorNotification.createMany({
    data: recipients.map((recipientId) => ({
      workspaceId,
      recipientId,
      type: 'mention',
      title: `${authorName} mentioned you`,
      body: comment.body.slice(0, 240),
      link: entityLink(comment.entityType, comment.entityId),
    })),
  });
}

export async function notifyOperator({
  workspaceId,
  recipientId,
  type,
  title,
  body,
  link,
}: {
  workspaceId: string;
  recipientId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  await db.operatorNotification.create({
    data: { workspaceId, recipientId, type, title, body, link },
  });
}

/**
 * Read the workspace Slack settings from PlatformSetting and POST to webhook
 * when configured. Stays fire-and-forget — never throws upstream.
 *
 * Per-event-type toggles live under PlatformSetting key `slack.notify.<type>`.
 */
export async function maybeFireSlack({
  workspaceId,
  type,
  title,
  body,
  link,
}: {
  workspaceId: string;
  type: 'comment' | 'application_new' | 'application_high' | 'mention';
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  try {
    const [webhookSetting, toggleSetting] = await Promise.all([
      db.platformSetting.findFirst({
        where: { workspaceId, key: 'slack.webhook' },
      }),
      db.platformSetting.findFirst({
        where: { workspaceId, key: `slack.notify.${type}` },
      }),
    ]);
    const webhookUrl = webhookSetting?.value?.trim();
    if (!webhookUrl) return;
    const enabled =
      !toggleSetting
        ? type !== 'comment' // default: comments OFF, everything else ON
        : toggleSetting.value !== 'false' && toggleSetting.value !== '0';
    if (!enabled) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const fullLink = link ? `${appUrl}${link}` : undefined;
    const text = [title, body].filter(Boolean).join('\n');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*${title}*${body ? `\n${body}` : ''}` },
          },
          ...(fullLink
            ? [
                {
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: { type: 'plain_text', text: 'Open' },
                      url: fullLink,
                    },
                  ],
                },
              ]
            : []),
        ],
      }),
    }).catch(() => {});
  } catch {
    // swallow — Slack failures must never break the operator action
  }
}
