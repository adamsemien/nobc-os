import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '../../_components/PageHeader';
import { CommunicationsEditor, type TemplateRow, type SettingRow } from './_components/CommunicationsEditor';
import { MemberFaqEditor } from './_components/MemberFaqEditor';

export default async function CommunicationsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const res = await operatorServerFetch('/api/operator/settings/communications');

  // A failed fetch must not render an empty editor whose copy blames missing
  // seeds — surface the failure and change nothing.
  if (!res.ok) {
    return (
      <div className="px-6 pb-16 pt-8 lg:px-10">
        <div className="mx-auto w-full max-w-[1000px]">
          <PageHeader
            title="Communications"
            subtitle="Email templates and auto-notification settings."
            crumbs={[
              { href: '/operator/settings', label: 'Settings' },
              { label: 'Communications' },
            ]}
          />
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            Could not load communications settings. Refresh to try again — nothing was changed.
          </p>
        </div>
      </div>
    );
  }

  const data = (await res.json()) as { templates: TemplateRow[]; settings: SettingRow[] };
  const templates = data.templates;
  const settings = data.settings;

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1000px]">
        <PageHeader
          title="Communications"
          subtitle="Email templates and auto-notification settings."
          crumbs={[
            { href: '/operator/settings', label: 'Settings' },
            { label: 'Communications' },
          ]}
        />
        <CommunicationsEditor initialTemplates={templates} initialSettings={settings} />
        <div className="mt-10">
          <MemberFaqEditor />
        </div>
      </div>
    </div>
  );
}
