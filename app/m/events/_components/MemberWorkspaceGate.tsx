/** Shown when the signed-in user's account cannot be linked to a membership. */
export function MemberWorkspaceGate() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-events-ref-cream px-6 py-24 text-center text-events-ref-ink">
      <p className="max-w-md text-base font-normal leading-relaxed">
        This area is for members only.
      </p>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-events-ref-muted">
        If you&apos;ve applied, you&apos;ll receive a welcome email once you&apos;re approved — keep
        an eye on your inbox. If you&apos;re already a member, make sure you&apos;re signed in with
        the same email address your membership is under.
      </p>
    </div>
  );
}
