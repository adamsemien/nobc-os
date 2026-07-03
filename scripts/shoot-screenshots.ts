/** Decision 7 report screenshots (Event Builder Rebuild).
 *  Captures: guest page desktop + mobile (published), the token-gated draft
 *  preview, the sold-out state, and the authenticated builder. Local dev
 *  server on :3111 with CHECKIN_SECRET=shot-secret-local-only. Dev DB only.
 *
 *  Usage: npx tsx scripts/shoot-screenshots.ts '<seed json>' <outDir>
 */
import { chromium } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test.local" });
dotenv.config({ path: ".env.local" });
process.env.CHECKIN_SECRET = "shot-secret-local-only";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3111";

async function main(): Promise<void> {
  const seed = JSON.parse(process.argv[2]) as {
    workspaceId: string;
    publishedSlug: string;
    publishedId: string;
    draftId: string;
  };
  const outDir = process.argv[3];
  const url = process.env.DATABASE_URL!;
  if (url.includes("ep-twilight-forest")) throw new Error("prod refused");
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

  const { mintPreviewToken } = await import("../lib/preview-token");
  const previewToken = mintPreviewToken({
    workspaceId: seed.workspaceId,
    eventId: seed.draftId,
  });
  if (!previewToken) throw new Error("preview token mint failed");

  const browser = await chromium.launch();

  // Guest page - desktop and mobile (published).
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${BASE}/e/${seed.publishedSlug}`, { waitUntil: "networkidle" });
  await desktop.screenshot({ path: `${outDir}/guest-published-desktop.png`, fullPage: false });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await mobile.goto(`${BASE}/e/${seed.publishedSlug}`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: `${outDir}/guest-published-mobile.png`, fullPage: false });

  // Draft preview - the token-gated exact anon render.
  await desktop.goto(`${BASE}/e/preview/${previewToken}`, { waitUntil: "networkidle" });
  await desktop.screenshot({ path: `${outDir}/guest-draft-preview-desktop.png` });

  // Sold-out state (ADD 3): fill the room, reshoot, restore.
  await db.event.update({ where: { id: seed.publishedId }, data: { capacity: 1 } });
  const member = await db.member.create({
    data: {
      workspaceId: seed.workspaceId,
      clerkUserId: "user_shot_soldout",
      email: "soldout@example.com",
      firstName: "Sold",
      lastName: "Out",
      status: "GUEST",
    },
  });
  const rsvp = await db.rSVP.create({
    data: {
      workspaceId: seed.workspaceId,
      eventId: seed.publishedId,
      memberId: member.id,
      status: "CONFIRMED",
      ticketStatus: "confirmed",
    },
  });
  await mobile.goto(`${BASE}/e/${seed.publishedSlug}`, { waitUntil: "networkidle" });
  await mobile.getByText("Every seat for this evening is spoken for.").scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: `${outDir}/guest-sold-out-mobile.png` });
  await db.rSVP.delete({ where: { id: rsvp.id } });
  await db.member.delete({ where: { id: member.id } });
  await db.event.update({ where: { id: seed.publishedId }, data: { capacity: 60 } });

  // The builder - authenticated via the house Clerk test-login pattern.
  try {
    process.env.CLERK_FRONTEND_API_URL = undefined as unknown as string;
    await clerkSetup();
    const operator = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    await setupClerkTestingToken({ page: operator });
    await operator.goto(`${BASE}/apply`);
    await operator.waitForFunction(
      () => !!(window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      undefined,
      { timeout: 20_000 },
    );
    const signIn = await operator.evaluate(
      async ({ email, password }: { email: string; password: string }) => {
        const Clerk = (window as unknown as {
          Clerk: {
            client: {
              signIn: {
                create: (a: Record<string, string>) => Promise<{ status: string; createdSessionId: string }>;
              };
            };
            setActive: (a: { session: string }) => Promise<void>;
          };
        }).Clerk;
        try {
          const attempt = await Clerk.client.signIn.create({
            identifier: email,
            password,
            strategy: "password",
          });
          if (attempt.status === "complete") {
            await Clerk.setActive({ session: attempt.createdSessionId });
            return { ok: true as const };
          }
          return { ok: false as const, status: attempt.status };
        } catch (e) {
          return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
        }
      },
      {
        email: process.env.CLERK_TEST_OPERATOR_EMAIL!,
        password: process.env.CLERK_TEST_OPERATOR_PASSWORD!,
      },
    );
    if (!signIn.ok) throw new Error(`sign-in failed: ${JSON.stringify(signIn)}`);

    // One interaction to a draft, straight into the builder.
    await operator.goto(`${BASE}/operator/events/new`);
    await operator.fill('input[name="title"]', "Screenshot draft - safe to delete");
    // Enter submits the form - a fixed overlay (DevToolbar) can intercept the
    // button's hit target in headless runs.
    await operator.press('input[name="title"]', "Enter");
    await operator.waitForURL("**/operator/events/*/builder", { timeout: 30_000 });
    await operator.waitForTimeout(4000); // let the preview iframe render
    const skip = operator.getByText("Skip", { exact: true });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await operator.waitForTimeout(600);
    }
    await operator.screenshot({ path: `${outDir}/builder-desktop.png` });
    console.log("builder shot: ok");
  } catch (err) {
    console.error("builder shot failed:", err instanceof Error ? err.message : err);
  }

  await browser.close();
  await db.$disconnect();
  console.log("done");
}

main().catch((err) => {
  console.error("[shoot] failed:", err);
  process.exit(1);
});
