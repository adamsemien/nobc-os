import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { RoomDashboard, type RoomData } from './_components/RoomDashboard';

export const dynamic = 'force-dynamic';

export default async function TheRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const res = await operatorServerFetch(`/api/operator/events/${id}/room`);

  if (res.status === 404) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1520] text-white">
        <div className="text-center">
          <p className="mb-4 text-sm opacity-70">Event not found.</p>
          <Link href="/operator/events" className="text-sm underline">
            Back to events
          </Link>
        </div>
      </div>
    );
  }
  if (!res.ok) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1520] text-white">
        <div className="text-center">
          <p className="mb-4 text-sm opacity-70">Could not load the room.</p>
          <Link href={`/operator/events/${id}`} className="text-sm underline">
            ← Back to event
          </Link>
        </div>
      </div>
    );
  }

  const initial = (await res.json()) as RoomData;

  return <RoomDashboard eventId={id} initial={initial} />;
}
