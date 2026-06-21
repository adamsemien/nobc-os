/**
 * /app/operator/stories/page.tsx — Story generation UI
 *
 * Allows operators to:
 * 1. Select DAM assets
 * 2. Enter event name + day number
 * 3. Generate stories with overlays
 * 4. Preview and download
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Asset {
  id: string;
  filename: string;
  thumbnailUrl?: string;
}

interface GeneratedStory {
  storyId: string;
  storyUrl: string;
  assetId: string;
}

export default function StoriesPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [eventName, setEventName] = useState('');
  const [dayCount, setDayCount] = useState(1);
  const [position, setPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [loading, setLoading] = useState(false);
  const [stories, setStories] = useState<GeneratedStory[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch DAM assets
  useEffect(() => {
    async function loadAssets() {
      try {
        const res = await fetch('/api/media/dam/assets');
        if (!res.ok) throw new Error('Failed to load assets');
        const data = await res.json();
        setAssets(data.assets || []);
      } catch (err) {
        setToast({ message: 'Failed to load assets', type: 'error' });
      }
    }
    loadAssets();
  }, []);

  // Generate stories
  async function handleGenerate() {
    if (selectedAssetIds.length === 0 || !eventName.trim()) {
      setToast({ message: 'Select assets and enter event name', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: selectedAssetIds,
          eventName,
          dayCount,
          position,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setStories(data.stories);
      setToast({ message: `Generated ${data.stories.length} stories`, type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Generation failed',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Instagram Stories Generator</h1>
        <p className="text-sm text-gray-600 mt-2">Select DAM assets, add text overlay, generate stories</p>
      </div>

      {/* Asset Selection */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">1. Select Assets</h2>
        <div className="grid grid-cols-4 gap-4 max-h-96 overflow-y-auto p-4 border rounded-lg bg-gray-50">
          {assets.map((asset) => (
            <button
              key={asset.id}
              onClick={() =>
                setSelectedAssetIds((prev) =>
                  prev.includes(asset.id)
                    ? prev.filter((id) => id !== asset.id)
                    : [...prev, asset.id],
                )
              }
              className={`relative p-2 border-2 rounded-lg transition ${
                selectedAssetIds.includes(asset.id)
                  ? 'border-red-600 bg-red-50'
                  : 'border-gray-200 bg-white hover:border-gray-400'
              }`}
            >
              <div className="aspect-square bg-gray-200 rounded overflow-hidden">
                {asset.thumbnailUrl && (
                  <Image
                    src={asset.thumbnailUrl}
                    alt={asset.filename}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <p className="text-xs truncate mt-1">{asset.filename}</p>
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-600">
          Selected: {selectedAssetIds.length} asset{selectedAssetIds.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Story Config */}
      <div className="space-y-4 bg-gray-50 p-6 rounded-lg">
        <h2 className="text-lg font-semibold">2. Story Configuration</h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Event Name</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g., Summer Soirée"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Day Count</label>
            <input
              type="number"
              value={dayCount}
              onChange={(e) => setDayCount(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Text Position</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as 'top' | 'center' | 'bottom')}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || selectedAssetIds.length === 0 || !eventName.trim()}
          className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-400"
        >
          {loading ? 'Generating...' : 'Generate Stories'}
        </button>
      </div>

      {/* Generated Stories */}
      {stories.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Generated Stories</h2>
          <div className="grid grid-cols-2 gap-4">
            {stories.map((story) => (
              <div key={story.storyId} className="border rounded-lg overflow-hidden bg-white shadow">
                <div className="aspect-[9/16] bg-gray-200 relative">
                  <Image
                    src={story.storyUrl}
                    alt="Generated story"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-4 space-y-2">
                  <a
                    href={story.storyUrl}
                    download
                    className="block bg-red-600 text-white px-4 py-2 rounded text-center hover:bg-red-700"
                  >
                    Download
                  </a>
                  <p className="text-xs text-gray-600">Story ID: {story.storyId.slice(0, 8)}…</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
