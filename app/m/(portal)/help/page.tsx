import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';

type Faq = { question: string; answer: string };

const DEFAULT_FAQ: Faq[] = [
  {
    question: 'What is No Bad Company?',
    answer:
      'A curated member club for builders, hosts, and curators in Austin. We run dinners, residencies, and late-night gatherings for the people in our orbit.',
  },
  {
    question: 'How do I RSVP?',
    answer:
      'Go to Events, pick what looks good, and follow the buttons. Some events are open to members, some require an application or ticket — you’ll see the path clearly.',
  },
  {
    question: 'What if I can’t make it?',
    answer:
      'Cancel from My RSVPs as early as you can. If the event has a refund window, your card is refunded automatically. After that, we don’t refund — give your spot to someone who can use it.',
  },
  {
    question: 'How do plus-ones work?',
    answer:
      'When an event allows plus-ones, you can add a name and Instagram handle during RSVP. They show up at the door under your name.',
  },
  {
    question: 'How do I update my info?',
    answer: 'Profile → edit your name, phone, contact preferences. Email lives in your Clerk account.',
  },
  {
    question: 'Who do I contact?',
    answer: 'team@thenobadcompany.com — Adam and Chloe read every message.',
  },
];

function parseFaq(json: string | null | undefined): Faq[] {
  if (!json) return DEFAULT_FAQ;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return DEFAULT_FAQ;
    const cleaned = parsed
      .filter((p: any) => typeof p?.question === 'string' && typeof p?.answer === 'string')
      .map((p: any) => ({ question: String(p.question), answer: String(p.answer) }));
    return cleaned.length ? cleaned : DEFAULT_FAQ;
  } catch {
    return DEFAULT_FAQ;
  }
}

export default async function MemberHelpPage() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const setting = await db.platformSetting.findFirst({
    where: { workspaceId, key: 'help.member.faq' },
    select: { value: true },
  });
  const faq = parseFaq(setting?.value);

  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
      <h1
        className="text-3xl italic mb-2"
        style={{ color: 'var(--events-fg)', fontFamily: 'var(--font-display)' }}
      >
        Help
      </h1>
      <p
        className="text-sm mb-10"
        style={{ color: 'var(--events-fg-soft)' }}
      >
        The short answers. For anything else, email team@thenobadcompany.com.
      </p>
      <ul className="space-y-8">
        {faq.map((item, i) => (
          <li key={i}>
            <h2
              className="text-base italic mb-2"
              style={{ color: 'var(--events-fg)', fontFamily: 'var(--font-display)' }}
            >
              {item.question}
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--events-fg-soft)' }}
            >
              {item.answer}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
