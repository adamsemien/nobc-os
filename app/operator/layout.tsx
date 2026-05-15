import { OperatorNav } from './operator-nav';
import { AiChatPanel } from './_components/AiChatPanel';

export default function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--nobc-ivory)' }}>
      <OperatorNav />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <AiChatPanel />
    </div>
  );
}
