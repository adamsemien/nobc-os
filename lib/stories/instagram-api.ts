/**
 * Instagram Graph API client — publishing stories (containers) to a business account.
 *
 * Reference: https://developers.facebook.com/docs/instagram-graph-api/guides/content-publishing
 *
 * To publish a story (Reels, images, video):
 * 1. Create a media container: POST /me/media { media_type, video_url | image_url, caption? }
 * 2. Poll the container for status until it's 'FINISHED' or 'ERROR'
 * 3. Publish the container: POST /me/media_publish { creation_id }
 *
 * For stories, use media_type='STORIES' + image_url or video_url.
 *
 * Environment variables required:
 * - INSTAGRAM_BUSINESS_ACCOUNT_ID
 * - INSTAGRAM_ACCESS_TOKEN
 */

class InstagramGraphAPIClient {
  private businessAccountId: string | null;
  private accessToken: string | null;

  constructor() {
    this.businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? null;
    this.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? null;
  }

  /**
   * Check if Instagram integration is configured.
   */
  isConfigured(): boolean {
    return this.businessAccountId != null && this.accessToken != null;
  }

  /**
   * Create a story media container. Returns the container ID.
   *
   * @param imageUrl - Publicly-accessible HTTPS URL to the image (min 1080x1920 recommended)
   * @param caption - Optional caption/description
   */
  async createStoryContainer(imageUrl: string, caption?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Instagram integration not configured');
    }

    const url = `https://graph.instagram.com/v18.0/${this.businessAccountId}/media`;
    const params = new URLSearchParams({
      media_type: 'STORIES',
      image_url: imageUrl,
      access_token: this.accessToken!,
    });

    if (caption) {
      params.append('caption', caption);
    }

    const res = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Instagram API error: ${res.status} ${error}`);
    }

    const data = await res.json();
    if (!data.id) {
      throw new Error('No media container ID in response');
    }

    return data.id;
  }

  /**
   * Poll a container for its status. Returns the status: 'FINISHED', 'ERROR', or 'IN_PROGRESS'.
   */
  async getContainerStatus(containerId: string): Promise<{
    status: string;
    errorMessage?: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Instagram integration not configured');
    }

    const url = `https://graph.instagram.com/v18.0/${containerId}`;
    const params = new URLSearchParams({
      fields: 'status,status_code',
      access_token: this.accessToken!,
    });

    const res = await fetch(`${url}?${params}`);

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Instagram API error: ${res.status} ${error}`);
    }

    const data = await res.json();
    return {
      status: data.status ?? 'UNKNOWN',
      errorMessage: data.status_code === 'ERROR' ? 'Media creation failed' : undefined,
    };
  }

  /**
   * Publish a finalized media container. Returns the published media ID.
   */
  async publishContainer(containerId: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Instagram integration not configured');
    }

    const url = `https://graph.instagram.com/v18.0/${this.businessAccountId}/media_publish`;
    const params = new URLSearchParams({
      creation_id: containerId,
      access_token: this.accessToken!,
    });

    const res = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Instagram API error: ${res.status} ${error}`);
    }

    const data = await res.json();
    if (!data.id) {
      throw new Error('No media ID in response');
    }

    return data.id;
  }

  /**
   * End-to-end flow: create + poll until ready + publish.
   *
   * Polls up to maxRetries times with delayMs between attempts.
   */
  async publishStoryWithRetry(
    imageUrl: string,
    opts?: {
      caption?: string;
      maxRetries?: number;
      delayMs?: number;
    }
  ): Promise<string> {
    const { caption, maxRetries = 10, delayMs = 1000 } = opts ?? {};

    // Create the container
    const containerId = await this.createStoryContainer(imageUrl, caption);

    // Poll for completion
    for (let i = 0; i < maxRetries; i++) {
      const { status, errorMessage } = await this.getContainerStatus(containerId);

      if (status === 'FINISHED') {
        // Container is ready — publish it
        const mediaId = await this.publishContainer(containerId);
        return mediaId;
      }

      if (status === 'ERROR') {
        throw new Error(`Container creation failed: ${errorMessage}`);
      }

      // Still in progress — wait and retry
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(`Container did not finish after ${maxRetries} attempts`);
  }
}

let clientInstance: InstagramGraphAPIClient | null = null;

export function getInstagramClient(): InstagramGraphAPIClient {
  if (!clientInstance) {
    clientInstance = new InstagramGraphAPIClient();
  }
  return clientInstance;
}
