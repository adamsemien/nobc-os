import { OperatorNav } from './operator-nav';
import { AiChatPanel } from './_components/AiChatPanel';

export default function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="operator-scope flex min-h-screen"
      style={{ background: 'var(--page-bg)' }}
    >
      <OperatorNav />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">{children}</main>
      <AiChatPanel />
    </div>
  );
}
