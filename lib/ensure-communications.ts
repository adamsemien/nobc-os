import { db } from './db';
import { DEFAULT_EMAIL_TEMPLATES, DEFAULT_PLATFORM_SETTINGS } from './email-templates-defaults';

/** Idempotently seeds a workspace's EmailTemplate + PlatformSetting rows with defaults.
 *  Safe to call from any operator-touching route that loads communications data. */
export async function ensureCommunicationsSeed(workspaceId: string): Promise<void> {
  const existingTemplates = await db.emailTemplate.findMany({
    where: { workspaceId },
    select: { key: true },
  });
  const haveKeys = new Set(existingTemplates.map((t) => t.key));
  const missingTemplates = DEFAULT_EMAIL_TEMPLATES.filter((t) => !haveKeys.has(t.key));
  if (missingTemplates.length > 0) {
    await db.emailTemplate.createMany({
      data: missingTemplates.map((t) => ({
        workspaceId,
        key: t.key,
        name: t.name,
        description: t.description,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        bodyText: t.bodyText,
        variables: t.variables,
        enabled: t.enabled,
      })),
    });
  }

  const existingSettings = await db.platformSetting.findMany({
    where: { workspaceId },
    select: { key: true },
  });
  const haveSettingKeys = new Set(existingSettings.map((s) => s.key));
  const missingSettings = DEFAULT_PLATFORM_SETTINGS.filter((s) => !haveSettingKeys.has(s.key));
  if (missingSettings.length > 0) {
    await db.platformSetting.createMany({
      data: missingSettings.map((s) => ({
        workspaceId,
        key: s.key,
        value: s.value,
        type: s.type,
        description: s.description,
      })),
    });
  }
}
