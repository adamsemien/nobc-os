import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { AI_MODELS, DEFAULT_AI_MODEL, type AIModelId } from '@/lib/ai-models';
import { PageHeader } from '../../_components/PageHeader';
import { ModelSwitcher } from './_components/ModelSwitcher';

export default async function ModelSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const workspaceId = await requireWorkspaceId(userId);
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiModel: true },
  });
  const currentId = (workspace?.aiModel as AIModelId | null) ?? DEFAULT_AI_MODEL;

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[820px]">
        <PageHeader
          title="AI Model"
          subtitle="The model powering chat, vibe reads, and event-builder suggestions."
          crumbs={[
            { href: '/operator/settings', label: 'Settings' },
            { label: 'AI Model' },
          ]}
        />
        <ModelSwitcher models={AI_MODELS} currentId={currentId} />
      </div>
    </div>
  );
}
