import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '../../_components/PageHeader';
import { CommunicationsEditor, type TemplateRow, type SettingRow } from './_components/CommunicationsEditor';

export default async function CommunicationsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const res = await operatorServerFetch('/api/operator/settings/communications');
  let templates: TemplateRow[] = [];
  let settings: SettingRow[] = [];
  if (res.ok) {
    const data = (await res.json()) as { templates: TemplateRow[]; settings: SettingRow[] };
    templates = data.templates;
    settings = data.settings;
  }

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
      </div>
    </div>
  );
}
