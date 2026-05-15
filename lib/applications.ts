import { db } from './db';

const applicationSelect = {
  id: true,
  fullName: true,
  email: true,
  city: true,
  phone: true,
  createdAt: true,
  aiTags: true,
  aiScore: true,
  aiRecommendation: true,
  aiReasoning: true,
  referredBy: true,
  answers: {
    select: {
      id: true,
      questionKey: true,
      answer: true,
    },
  },
} as const;

export async function getPendingApplications(workspaceId: string) {
  return db.application.findMany({
    where: { workspaceId, status: 'PENDING' },
    select: applicationSelect,
    orderBy: { createdAt: 'asc' },
  });
}

export async function getApplicationById(workspaceId: string, id: string) {
  return db.application.findFirst({
    where: { workspaceId, id },
    select: applicationSelect,
  });
}
