import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';

export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  // Auth chrome: a signed-in applicant gets sign-out + switch/manage-account
  // across every /apply surface (door, form, received, decided). Mirrors the
  // operator layout's UserButton; sign-out follows the app-level ClerkProvider
  // default. auth() is a read — no DB write. Hidden for anonymous visitors.
  const { userId } = await auth();
  return (
    <div data-theme="nobc">
      {userId && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50 }}>
          <UserButton />
        </div>
      )}
      {children}
    </div>
  );
}
