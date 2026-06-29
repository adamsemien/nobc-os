import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ background: 'var(--page-bg)' }}
    >
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/apply" />
    </div>
  );
}
