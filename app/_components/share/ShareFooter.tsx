/** Editorial-minimal footer — wordmark + contact mailto. Mirrors TemplateMinimal. */
export function ShareFooter({ companyName }: { companyName?: string | null }) {
  const company = (companyName ?? '').trim();
  return (
    <footer className="mx-auto w-full max-w-3xl px-6 pb-16 pt-2 text-center">
      <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />
      <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        {company ? (
          <span>{company}</span>
        ) : (
          <>
            <span className="text-[var(--nobc-red)]">NO BAD </span>
            <span>COMPANY</span>
          </>
        )}
      </p>
      <a
        href="mailto:team@thenobadcompany.com"
        className="mt-3 inline-block text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
      >
        team@thenobadcompany.com
      </a>
    </footer>
  );
}
