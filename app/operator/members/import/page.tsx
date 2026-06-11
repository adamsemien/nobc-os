import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { PageHeader } from '../../_components/PageHeader';
import { ImportPreviewClient } from './ImportPreviewClient';

// CSV import — preview (dry-run). STAFF+ (READ_ONLY operators cannot import).
// The preview composes the CSV adapter + identity-resolution engine against live
// members and writes nothing; persisting the import lands in the schema window.
export default async function ImportPage() {
  await requireRolePage(OperatorRole.STAFF);

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/members', label: 'Members' }, { label: 'Import' }]}
        title="Import contacts"
        subtitle="Preview a CSV against your members before anything is saved."
      />
      <ImportPreviewClient />
    </div>
  );
}
