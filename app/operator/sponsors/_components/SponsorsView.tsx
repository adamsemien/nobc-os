'use client';

import { useState } from 'react';
import { AddSponsorDrawer, type CreatedSponsor } from './AddSponsorDrawer';

export type SponsorRow = {
  id: string;
  name: string;
  contactEmail: string | null;
  rightsFeeCents: number | null;
  createdAt: string;
};

function formatFee(cents: number | null): string {
  if (cents == null) return '-';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function SponsorsView({ initialSponsors }: { initialSponsors: SponsorRow[] }) {
  const [sponsors, setSponsors] = useState<SponsorRow[]>(initialSponsors);

  function onCreated(s: CreatedSponsor) {
    setSponsors((prev) => [
      {
        id: s.id,
        name: s.name,
        contactEmail: s.contactEmail,
        rightsFeeCents: s.rightsFeeCents,
        createdAt: s.createdAt,
      },
      ...prev,
    ]);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-text-primary">Sponsors</h1>
          <p className="text-xs text-text-muted">
            Brand profiles that power Sponsor Intelligence, brand-lift surveys, and recaps.
          </p>
        </div>
        <AddSponsorDrawer onCreated={onCreated} />
      </header>

      {sponsors.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
          No sponsors yet. Add your first sponsor to unlock briefs, surveys, and recaps.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Rights fee</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2 text-text-primary">{s.name}</td>
                  <td className="px-4 py-2 text-text-secondary">{s.contactEmail ?? '-'}</td>
                  <td className="px-4 py-2 tabular-nums text-text-secondary">{formatFee(s.rightsFeeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
