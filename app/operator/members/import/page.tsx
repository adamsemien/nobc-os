import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { getAppEnv } from '@/lib/app-env';
import { PageHeader } from '../../_components/PageHeader';
import { ImportPreviewClient } from './ImportPreviewClient';
import { ConnectorImports } from './_components/ConnectorImports';

// CSV import — preview (dry-run) + one-click connector sync. STAFF+ (READ_ONLY operators
// cannot import). The CSV preview writes nothing; the connector cards below write through
// the shared, suppression-guarded persist pipeline.
export default async function ImportPage() {
  await requireRolePage(OperatorRole.STAFF);
  const envLabel = getAppEnv().label;

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/members', label: 'Members' }, { label: 'Import' }]}
        title="Import contacts"
        subtitle="Preview a CSV against your members before anything is saved."
      />
      <ImportPreviewClient />
      <ConnectorImports envLabel={envLabel} />
    </div>
  );
}
