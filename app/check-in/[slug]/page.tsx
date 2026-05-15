import { CheckInClient } from './_components/CheckInClient';

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug } = await params;
  const { workspace = 'nobc' } = await searchParams;

  return <CheckInClient eventSlug={slug} workspaceSlug={workspace} />;
}
