import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '../../_components/PageHeader';
import { ApplicationFormEditor, type EditorQuestion } from './_components/ApplicationFormEditor';

export default async function ApplicationFormSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const res = await operatorServerFetch('/api/operator/settings/application');
  let questions: EditorQuestion[] = [];
  let templateName = 'Default Application';
  if (res.ok) {
    const data = (await res.json()) as {
      template: { id: string; name: string; slug: string };
      questions: EditorQuestion[];
    };
    questions = data.questions;
    templateName = data.template.name;
  }

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[820px]">
        <PageHeader
          title="Application Form"
          subtitle={`Questions on ${templateName}. Members and guests will see these on /apply.`}
          crumbs={[
            { href: '/operator/settings', label: 'Settings' },
            { label: 'Application Form' },
          ]}
        />
        <ApplicationFormEditor initial={questions} />
      </div>
    </div>
  );
}
