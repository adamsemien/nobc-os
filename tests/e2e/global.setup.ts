import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

/** Fetches a Clerk Testing Token so automated runs bypass bot protection.
 *  Authenticates via the existing CLERK_SECRET_KEY — no new credentials. */
setup('clerk testing token', async () => {
  await clerkSetup();
});
