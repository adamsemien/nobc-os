'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'attendees', label: 'Attendees' },
  { key: 'applications', label: 'Applications' },
  { key: 'checkin', label: 'Check-in' },
  // Questions tab hidden from operator nav (V1.5) — gates cover the use case for now.
  // QuestionsTab.tsx stays on disk; page.tsx still renders it for ?tab=questions.
  // { key: 'questions', label: 'Questions' },
  { key: 'settings', label: 'Settings' },
];

type Props = {
  eventId: string;
  activeTab: string;
};

export function EventTabs({ eventId, activeTab }: Props) {
  const searchParams = useSearchParams();
  const current = searchParams.get('tab') ?? activeTab;

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {TABS.map(tab => {
        const isActive = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={`/operator/events/${eventId}?tab=${tab.key}`}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-b-2 border-primary text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
