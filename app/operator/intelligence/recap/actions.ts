'use server';

import { revalidatePath } from 'next/cache';
import { OperatorRole, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';

async function adminWorkspace(): Promise<string> {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) throw new Error('Forbidden');
  return gate.workspaceId;
}

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export interface SponsorBriefInput {
  sponsorBrandId: string;
  declaredObjectives: string;
  rightsFeeDollars: number | null;
  persona: {
    archetypes: string;
    seniority: string;
    industries: string;
    companySizes: string;
    minAttendance: number | null;
  };
}

/** Save a sponsor's Brief (objectives, persona, rights fee). ADMIN-gated, workspace-scoped. */
export async function saveSponsorBrief(input: SponsorBriefInput): Promise<{ ok: boolean }> {
  const workspaceId = await adminWorkspace();

  const persona = {
    archetypes: splitList(input.persona.archetypes),
    seniority: splitList(input.persona.seniority),
    industries: splitList(input.persona.industries),
    companySizes: splitList(input.persona.companySizes),
    ...(input.persona.minAttendance != null ? { minAttendance: input.persona.minAttendance } : {}),
  };
  const hasPersona = Object.values(persona).some((v) => (Array.isArray(v) ? v.length > 0 : v != null));

  // Scope by workspaceId so an operator can only edit their own workspace's sponsors.
  const updated = await db.sponsorBrandProfile.updateMany({
    where: { id: input.sponsorBrandId, workspaceId },
    data: {
      declaredObjectives: input.declaredObjectives.trim() || null,
      rightsFeeCents: input.rightsFeeDollars != null ? Math.round(input.rightsFeeDollars * 100) : null,
      targetPersonaCriteria: hasPersona ? (persona as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
  if (updated.count === 0) throw new Error('Sponsor not found in this workspace');

  revalidatePath('/operator/intelligence/recap');
  return { ok: true };
}

/** Create a new sponsor brand profile. ADMIN-gated, workspace-scoped. */
export async function createSponsorBrand(name: string): Promise<{ ok: boolean; id: string }> {
  const workspaceId = await adminWorkspace();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');
  const sponsor = await db.sponsorBrandProfile.create({
    data: { workspaceId, name: trimmed },
    select: { id: true },
  });
  revalidatePath('/operator/intelligence/recap');
  return { ok: true, id: sponsor.id };
}
