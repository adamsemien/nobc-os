import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ background: 'var(--page-bg)' }}
    >
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </div>
  );
}
