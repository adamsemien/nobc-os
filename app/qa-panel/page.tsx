import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { QAPanelClient } from './QAPanelClient';

// The QA pop-out is an internal tool. Middleware only requires a signed-in
// user on /qa-panel, not a role — so without this gate any member who knows
// the route could reach QA scoring data. Require ADMIN (non-admins redirect
// to /operator), matching the requireRolePage pattern used by operator pages.
export default async function QAPanelPage() {
  await requireRolePage(OperatorRole.ADMIN);
  return <QAPanelClient />;
}
