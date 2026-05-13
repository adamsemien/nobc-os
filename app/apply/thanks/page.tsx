import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair-display',
});

export default function ApplyThanksPage() {
  return (
    <main
      className={`${playfair.variable} min-h-screen bg-apply-cream flex flex-col items-center justify-center px-6 text-center`}
    >
      <p className="text-[11px] tracking-[0.25em] uppercase text-apply-muted mb-12">
        THE <span className="text-apply-crimson">NO BAD</span> COMPANY
      </p>
      <h1 className="font-playfair text-4xl text-apply-ink mb-4">
        We got it.
        <br />
        <em>We&rsquo;ll be in touch.</em>
      </h1>
      <p className="text-sm text-apply-muted max-w-xs mt-4">
        We read every word. You&rsquo;ll hear from us within two weeks. Sometimes sooner.
      </p>
    </main>
  );
}
