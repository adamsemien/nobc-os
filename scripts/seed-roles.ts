import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Seed operator roles: make Adam Semien and Chloe Chiang ADMIN.
 *
 * Operators live in Clerk, so we resolve each person there, then seed them as
 * ADMIN in the workspace the app actually resolves for them (the same
 * getOrCreateWorkspaceForUser path the runtime gate uses) — guaranteeing they
 * are never locked out of the routes this milestone gates. Idempotent (upsert).
 *
 *   npx tsx scripts/seed-roles.ts
 */
async function main() {
  const { clerkClient } = await import('@clerk/nextjs/server');
  const { db } = await import('@/lib/db');
  const { getOrCreateWorkspaceForUser } = await import('@/lib/auth');

  const client = await clerkClient();

  async function makeAdmin(
    workspaceId: string,
    clerkUserId: string | null,
    emailRaw: string,
    firstName: string | null,
    lastName: string | null,
  ) {
    const email = emailRaw.trim().toLowerCase();
    await db.workspaceMember.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: { workspaceId, clerkUserId, email, firstName, lastName, role: 'ADMIN' },
      update: { clerkUserId, firstName, lastName, role: 'ADMIN' },
    });
    console.log(`  ✓ ADMIN: ${email} (${clerkUserId ?? 'invite — no Clerk account yet'})`);
  }

  // --- Adam: find by email, seed in the workspace the app resolves for him ---
  console.log('Seeding Adam Semien…');
  const adamList = await client.users.getUserList({ emailAddress: ['adamsemien@gmail.com'] });
  const adam = adamList.data[0];
  let adamWorkspaceId: string | null = null;
  if (adam) {
    const ws = await getOrCreateWorkspaceForUser(adam.id);
    adamWorkspaceId = ws.id;
    console.log(`  workspace: ${ws.id} "${ws.name}" (${ws.clerkOrgId})`);
    await makeAdmin(
      ws.id,
      adam.id,
      adam.primaryEmailAddress?.emailAddress ?? adam.emailAddresses[0]?.emailAddress ?? 'adamsemien@gmail.com',
      adam.firstName,
      adam.lastName,
    );
  } else {
    console.log('  ! Adam not found in Clerk by email — skipped.');
  }

  // --- Chloe: find by name; if she has no Clerk account, store an ADMIN invite ---
  console.log('Seeding Chloe Chiang…');
  const chloeList = await client.users.getUserList({ query: 'Chloe' });
  const chloe = chloeList.data.find((u) => {
    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
    return name.includes('chloe') || name.includes('chiang');
  });
  if (chloe) {
    const ws = await getOrCreateWorkspaceForUser(chloe.id);
    const email = chloe.primaryEmailAddress?.emailAddress ?? chloe.emailAddresses[0]?.emailAddress;
    if (email) {
      console.log(`  workspace: ${ws.id} "${ws.name}"`);
      await makeAdmin(ws.id, chloe.id, email, chloe.firstName, chloe.lastName);
    } else {
      console.log('  ! Chloe found in Clerk but has no email — skipped.');
    }
  } else if (adamWorkspaceId) {
    // No Clerk account for Chloe yet — store an ADMIN invite in Adam's workspace.
    // NOTE: email is a placeholder; correct it in the Team UI when known.
    const placeholder = 'chloe@thenobadcompany.com';
    console.log(`  ! Chloe has no Clerk account — storing ADMIN invite with PLACEHOLDER email "${placeholder}" (edit in Team UI).`);
    await makeAdmin(adamWorkspaceId, null, placeholder, 'Chloe', 'Chiang');
  } else {
    console.log('  ! Chloe not found and no Adam workspace to attach an invite to — skipped.');
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error('SEED FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
