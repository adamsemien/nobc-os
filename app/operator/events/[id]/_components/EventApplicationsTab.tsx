import { ApplicationsQueue, type ApplicationsQueueItem } from '@/app/operator/applications/_components/ApplicationsQueue';

type ApplicationRow = {
  id: string;
  fullName: string;
  email: string;
  city: string | null;
  phone: string | null;
  createdAt: string;
  submittedAt: string | null;
  status: string;
  aiTags: string[];
  aiScore: number | null;
  aiRecommendation: string | null;
  aiReasoning: string | null;
  answers: Record<string, string>;
};

type Props = {
  applications: ApplicationRow[];
  eventId: string;
};

export function EventApplicationsTab({ applications, eventId: _eventId }: Props) {
  if (applications.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-text-secondary">
        No pending applications for this event.
      </p>
    );
  }

  const items: ApplicationsQueueItem[] = applications.map(a => ({
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    city: a.city,
    phone: a.phone,
    createdAt: a.createdAt,
    submittedAt: a.submittedAt,
    aiTags: a.aiTags,
    aiScore: a.aiScore,
    aiRecommendation: a.aiRecommendation as ApplicationsQueueItem['aiRecommendation'],
    aiReasoning: a.aiReasoning,
    answers: a.answers,
    archetype: null,
    archetypeScores: null,
    referredBy: null,
    consentEmail: false,
    consentSms: false,
  }));

  return <ApplicationsQueue applications={items} />;
}
