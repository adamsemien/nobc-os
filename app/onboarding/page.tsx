'use client';

import { CreateOrganization } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';

/** Operator onboarding — intentional workspace creation.
 *
 *  Renders Clerk's <CreateOrganization /> so a signed-in user can deliberately
 *  create a Clerk org (= workspace = tenant). On completion Clerk sets the new org
 *  active; landing on /operator auto-provisions the Workspace row via
 *  getOrCreateWorkspaceForUser and grants ADMIN via the Clerk-org floor.
 *
 *  This page is dormant while Clerk "organizations required" is ON — every user
 *  already has an org, so they never reach here via the normal auth flow. It
 *  activates once Adam flips that setting OFF. */
export default function OnboardingPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ background: 'var(--page-bg)' }}
    >
      <div className="mb-8 text-center">
        <h1
          className="mb-2 text-2xl font-light tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Set up your club
        </h1>
        <p
          className="text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          Create a workspace to manage your events, members, and access.
        </p>
      </div>

      <CreateOrganization
        appearance={clerkAppearance}
        afterCreateOrganizationUrl="/operator"
      />
    </div>
  );
}
