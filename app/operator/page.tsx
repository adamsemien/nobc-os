import { redirect } from 'next/navigation';

/** /operator has no dashboard of its own — send operators to Applications. */
export default function OperatorIndexPage() {
  redirect('/operator/applications');
}
