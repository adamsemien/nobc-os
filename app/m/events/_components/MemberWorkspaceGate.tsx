/** Shown when the signed-in user has no Clerk org membership or workspace could not be resolved. */
export function MemberWorkspaceGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-events-ref-cream px-6 py-24 text-center text-events-ref-ink">
      <p className="max-w-md text-sm font-normal leading-relaxed text-events-ref-muted">
        Member pages are tied to a Clerk organization and workspace. This account is not in an
        organization yet, or the workspace could not be loaded. Ask an operator for an invite, or
        confirm your Clerk user has an active org membership.
      </p>
    </div>
  );
}
