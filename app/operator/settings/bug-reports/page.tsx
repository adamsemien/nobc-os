'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  DataTableShell,
  DataTableHead,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  EmptyState,
} from '@/components/ui';

interface Bug {
  id: string;
  description: string;
  location: string;
  screenshotUrl?: string;
  reportedAt: string;
  missionId: string;
  operatorName: string;
  missionType: string;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function BugReportsPage() {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dev/qa/bugs');
        if (!res.ok) {
          setError('Could not load bug reports.');
          return;
        }
        const data = (await res.json()) as { bugs: Bug[] };
        if (!cancelled) setBugs(data.bugs);
      } catch {
        if (!cancelled) setError('Network error.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Bug Reports"
        subtitle="Flagged during QA Game Mode missions. Newest first."
      />
      <div className="px-4 sm:px-6 pb-6">
        {loading && (
          <p className="text-sm text-text-secondary">Loading…</p>
        )}
        {error && !loading && (
          <p className="text-sm text-danger">{error}</p>
        )}
        {!loading && !error && bugs.length === 0 && (
          <EmptyState
            title="No bugs reported yet"
            subtitle="When operators hit '🐛 Found a bug' inside a QA mission, it lands here."
          />
        )}
        {!loading && !error && bugs.length > 0 && (
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader>When</DataTableHeader>
              <DataTableHeader>Operator</DataTableHeader>
              <DataTableHeader>Mission</DataTableHeader>
              <DataTableHeader>Location</DataTableHeader>
              <DataTableHeader>Description</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {bugs.map((b) => (
                <DataTableRow key={b.id}>
                  <DataTableCell className="whitespace-nowrap text-xs text-text-secondary">
                    {fmtTime(b.reportedAt)}
                  </DataTableCell>
                  <DataTableCell className="text-sm">{b.operatorName}</DataTableCell>
                  <DataTableCell className="text-xs text-text-secondary">
                    <span className="capitalize">
                      {b.missionType.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-xs font-mono text-text-secondary">
                    {b.location}
                  </DataTableCell>
                  <DataTableCell className="text-sm">{b.description}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
        )}
      </div>
    </div>
  );
}
