import { OperatorNav } from './operator-nav';
import { AiChatPanel } from './_components/AiChatPanel';
import { ObsidianIdleEgg } from './_components/ObsidianIdleEgg';

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
      <ObsidianIdleEgg />
    </div>
  );
}
