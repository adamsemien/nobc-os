import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { PageHeader } from '../../_components/PageHeader';
import { MemberFieldsEditor } from './_components/MemberFieldsEditor';

// F5 — member custom-field management (member-intelligence PR3 Slice 2). ADMIN only: the field
// schema is a workspace-shape decision. Activates the FieldDefinition registry; the record's
// Fields card renders these definitions and operators fill them inline (F4).

export default async function MemberFieldsSettingsPage() {
  await requireRolePage(OperatorRole.ADMIN, '/operator/settings');

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/settings', label: 'Settings' }, { label: 'Member fields' }]}
        title="Member fields"
        subtitle="Define the custom fields that appear on every member record. Operators fill them in on the record; sponsor visibility is off by default."
      />
      <MemberFieldsEditor />
    </div>
  );
}
