import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const now = new Date();
const daysOut = (n: number, hour = 0) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, hour);

const events = [
  {
    slug: "sunday-salon-june",
    title: "Sunday Salon",
    description:
      "An intimate afternoon of conversation, craft cocktails, and live music in a private East Austin residence. Curated programming moves between jazz trio sets and open discussion on culture, creativity, and the city's next chapter. Thirty seats. No agenda. Just the right people in the right room.",
    startAt: daysOut(12, 18),
    endAt: new Date(daysOut(12, 18).getTime() + 4 * 60 * 60 * 1000),
    location: "East Austin, TX",
    accessMode: "OPEN" as const,
    approvalRequired: false,
    capacity: 75,
    status: "PUBLISHED" as const,
  },
  {
    slug: "nocturne-at-the-paramour",
    title: "Nocturne at the Paramour",
    description:
      "An evening of live performance and late-night dining on the terrace of one of Austin's most storied private venues. A rotating cast of musicians, chefs, and artists share the stage in a format that resists categorization. Ticketed entry includes a four-course prix fixe and open wine service through midnight.",
    startAt: daysOut(28, 21),
    endAt: new Date(daysOut(28, 21).getTime() + 5 * 60 * 60 * 1000),
    location: "South Congress, Austin, TX",
    accessMode: "TICKETED" as const,
    approvalRequired: true,
    capacity: 75,
    status: "PUBLISHED" as const,
  },
  {
    slug: "founders-table-july",
    title: "Founders Table",
    description:
      "A closed dinner for operators, builders, and creative directors in the NoBC network. Twelve seats around a single table. One question anchors the evening — this season: what are you building that you haven't told anyone about yet? Guests are selected from member applications and operator invitations. Attendance is not guaranteed.",
    startAt: daysOut(55, 19),
    endAt: new Date(daysOut(55, 19).getTime() + 3 * 60 * 60 * 1000),
    location: "Downtown Austin, TX",
    accessMode: "APPLY_OR_PAY" as const,
    approvalRequired: true,
    capacity: 75,
    status: "PUBLISHED" as const,
  },
];

async function main() {
  const workspace = await db.workspace.findUnique({ where: { slug: "nobc" } });
  if (!workspace) throw new Error("Workspace with slug \"nobc\" not found. Run seed-workspace first.");

  for (const event of events) {
    await db.event.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: event.slug } },
      create: { workspaceId: workspace.id, ...event },
      update: { ...event },
    });
    console.log(`upserted: ${event.title} (${event.slug})`);
  }

  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => db.$disconnect());
