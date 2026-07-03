/** Phase 2 report screenshots (Night theme + immaculate pass).
 *  Captures: guest page desktop + mobile in paper, the same in Night, the
 *  Night draft-preview vs published parity pair, and the authenticated
 *  builder. Local dev server on :3111. Dev DB only.
 *
 *  Usage: npx tsx scripts/shoot-phase2.ts '<seed json>' <outDir>
 */
import { chromium, type Browser } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test.local" });
dotenv.config({ path: ".env.local" });
process.env.CHECKIN_SECRET = process.env.CHECKIN_SECRET ?? "shot-secret-local-only";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3111";

async function shootGuestPair(
  browser: Browser,
  slug: string,
  outDir: string,
  label: string,
): Promise<void> {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${BASE}/e/${slug}`, { waitUntil: "networkidle" });
  await desktop.screenshot({ path: `${outDir}/guest-${label}-desktop.png` });
  await desktop.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await mobile.goto(`${BASE}/e/${slug}`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: `${outDir}/guest-${label}-mobile.png` });
  await mobile.close();
}

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

  const browser = await chromium.launch();

  // 1. Paper (default) - proves the theme default is a pixel no-op register.
  await db.event.updateMany({
    where: { id: { in: [seed.publishedId, seed.draftId] } },
    data: { pageStyle: {} },
  });
  await shootGuestPair(browser, seed.publishedSlug, outDir, "paper");

  // 2. Night - flip the theme token and nothing else.
  await db.event.updateMany({
    where: { id: { in: [seed.publishedId, seed.draftId] } },
    data: { pageStyle: { theme: "night" } },
  });
  await shootGuestPair(browser, seed.publishedSlug, outDir, "night");

  // 3. Parity pair in Night: token-gated draft preview vs the published page,
  //    same assembly path.
  const { mintPreviewToken } = await import("../lib/preview-token");
  const previewToken = mintPreviewToken({
    workspaceId: seed.workspaceId,
    eventId: seed.draftId,
  });
  if (!previewToken) throw new Error("preview token mint failed");
  const parity = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await parity.goto(`${BASE}/e/preview/${previewToken}`, { waitUntil: "networkidle" });
  await parity.screenshot({ path: `${outDir}/night-parity-preview-desktop.png` });
  await parity.goto(`${BASE}/e/${seed.publishedSlug}`, { waitUntil: "networkidle" });
  await parity.screenshot({ path: `${outDir}/night-parity-published-desktop.png` });
  await parity.close();

  // 4. The builder - authenticated via the house Clerk test-login pattern.
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

    await operator.goto(`${BASE}/operator/events/new`);
    await operator.fill('input[name="title"]', "Phase 2 shot draft - safe to delete");
    await operator.press('input[name="title"]', "Enter");
    await operator.waitForURL("**/operator/events/*/builder", { timeout: 30_000 });
    await operator.waitForTimeout(4000);
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
  console.error("[shoot-phase2] failed:", err);
  process.exit(1);
});
