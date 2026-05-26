/** The asset shape returned by GET /api/media/dam/assets and used across the grid + preview. */
export interface MediaAsset {
  id: string;
  filename: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  fileType: 'PHOTO' | 'VIDEO';
  isSelect: boolean;
  tags: string[];
  aiTags: string[];
  sponsorName: string | null;
  eventId: string | null;
  qualityScore: number | null;
  shootDate: string | null;
  createdAt: string;
  size: number;
  shooterCredit: string | null;
}
