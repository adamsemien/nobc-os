/**
 * POST /api/media/dam/download-zip — stream a ZIP of selected originals (STAFF).
 * Stored (level 0 — JPEGs don't recompress); each entry streamed from its signed
 * R2 URL via archiver, so memory stays flat regardless of selection size.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import archiver from 'archiver';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { DOWNLOAD_URL_TTL, presignGet } from '@/lib/dam/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const b = await req.json().catch(() => null);
  const ids = Array.isArray(b?.assetIds)
    ? b.assetIds.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  if (ids.length === 0) return NextResponse.json({ error: 'assetIds required' }, { status: 400 });

  const assets = await db.asset.findMany({
    where: { id: { in: ids }, workspaceId, deletedAt: null },
    select: { filename: true, url: true },
  });
  if (assets.length === 0) return NextResponse.json({ error: 'Nothing to download' }, { status: 404 });

  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', (err) => console.error('[dam/zip] archive error', err));

  void (async () => {
    const used = new Set<string>();
    for (const a of assets) {
      try {
        const signed = await presignGet(a.url, DOWNLOAD_URL_TTL);
        if (!signed) continue;
        const res = await fetch(signed);
        if (!res.ok || !res.body) continue;
        let name = a.filename || 'file';
        for (let i = 1; used.has(name); i++) {
          name = (a.filename || 'file').replace(/(\.[^.]+)?$/, `-${i}$1`);
        }
        used.add(name);
        archive.append(Readable.fromWeb(res.body as unknown as NodeWebReadableStream), { name });
      } catch (err) {
        console.error('[dam/zip] append failed', { url: a.url, err });
      }
    }
    await archive.finalize();
  })();

  return new Response(Readable.toWeb(archive) as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="nobc-media.zip"',
    },
  });
}
