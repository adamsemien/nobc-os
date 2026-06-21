/**
 * Operator UI component for Instagram Story generation workflow.
 *
 * Features:
 * - Asset picker from DAM library
 * - Event selection
 * - Text overlay customization (event name, day counter)
 * - Live preview
 * - Generate and schedule buttons
 *
 * Placed at: app/operator/media/_components/StoryGeneratorPanel.tsx
 */

'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, Loader2, Check, AlertCircle } from 'lucide-react';
import { useOrganization } from '@clerk/nextjs';
import type { Asset, Event } from '@prisma/client';

interface StoryGeneratorPanelProps {
  /** Whether the panel is open. */
  isOpen: boolean;
  /** Callback when panel is closed. */
  onClose: () => void;
  /** Callback when a story is successfully generated. */
  onStoryGenerated?: (storyId: string, storyImageUrl: string) => void;
  /** DAM assets to pick from. */
  assets?: Asset[];
  /** Events to associate (for context). */
  events?: Event[];
}

export function StoryGeneratorPanel({
  isOpen,
  onClose,
  onStoryGenerated,
  assets = [],
  events = [],
}: StoryGeneratorPanelProps) {
  const { organization } = useOrganization();
  const workspaceId = organization?.id;

  // Form state
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [eventName, setEventName] = useState<string>('');
  const [dayCounter, setDayCounter] = useState<number | ''>('');
  const [title, setTitle] = useState<string>('');

  // UI state
  const [step, setStep] = useState<'config' | 'preview' | 'schedule'>('config');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [generatedStory, setGeneratedStory] = useState<{
    storyId: string;
    storyImageUrl: string;
    r2Key: string;
    status: string;
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const handleGenerateStory = useCallback(async () => {
    if (!selectedAssetId) {
      setError('Please select a source image');
      return;
    }

    setError('');
    setIsGenerating(true);

    try {
      const res = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedAssetId,
          eventId: selectedEventId || null,
          eventName: eventName || null,
          dayCounter: dayCounter ? parseInt(String(dayCounter), 10) : null,
          title: title || eventName,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate story');
      }

      const story = await res.json();
      setGeneratedStory(story);
      setStep('preview');
      setSuccess('Story generated successfully!');
      onStoryGenerated?.(story.storyId, story.storyImageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedAssetId, selectedEventId, eventName, dayCounter, title, onStoryGenerated]);

  const handleScheduleStory = useCallback(async () => {
    if (!generatedStory) {
      setError('No story generated');
      return;
    }

    setError('');
    setIsScheduling(true);

    try {
      const res = await fetch('/api/stories/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyIds: [generatedStory.storyId],
          startDate: new Date().toISOString(),
          publishInterval: 1,
          batchName: title || 'Story Batch',
          eventId: selectedEventId || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to schedule story');
      }

      setSuccess('Story scheduled for publishing!');
      setStep('schedule');

      // Reset form after a delay
      setTimeout(() => {
        setStep('config');
        setSelectedAssetId('');
        setSelectedEventId('');
        setEventName('');
        setDayCounter('');
        setTitle('');
        setGeneratedStory(null);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scheduling failed');
    } finally {
      setIsScheduling(false);
    }
  }, [generatedStory, selectedEventId, title, onClose]);

  // All hooks above are now called unconditionally; safe to bail out here.
  if (!isOpen || !workspaceId) return null;

  // ─────────────────────────────────────────────────────────────────
  // Render by step
  // ─────────────────────────────────────────────────────────────────

  if (step === 'preview') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Story Preview</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Preview image */}
            {generatedStory?.storyImageUrl && (
              <div className="flex justify-center">
                <div className="w-64 aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={generatedStory.storyImageUrl}
                    alt="Story preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Story details */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Title:</span> {title || eventName || 'Untitled'}
              </p>
              {dayCounter && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Day:</span> {dayCounter}
                </p>
              )}
              {selectedEvent && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Event:</span> {selectedEvent.name}
                </p>
              )}
            </div>

            {/* Success/Error messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            {success && !error && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2 items-start">
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4">
              <button
                onClick={() => setStep('config')}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg border"
              >
                Back
              </button>
              <button
                onClick={handleScheduleStory}
                disabled={isScheduling}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isScheduling && <Loader2 className="w-4 h-4 animate-spin" />}
                {isScheduling ? 'Scheduling...' : 'Schedule & Publish'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'schedule') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <h2 className="text-lg font-semibold">Story Scheduled!</h2>
          <p className="text-gray-600 text-sm">
            Your story is queued for publishing and will go live within 24 hours.
          </p>
          <button
            onClick={() => {
              setStep('config');
              onClose();
            }}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Default: config step
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Generate Instagram Story</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Asset Picker */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">
              Source Image <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-gray-600 mb-3">
              Select a photo from your DAM library. It will be cropped/scaled to fit Instagram Stories (1080×1920).
            </p>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">— Select an image —</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename} ({asset.width}×{asset.height})
                </option>
              ))}
            </select>
            {selectedAsset && (
              <div className="mt-2 text-xs text-gray-600">
                Size: {selectedAsset.width}×{selectedAsset.height} | Uploaded: {new Date(selectedAsset.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            )}
          </div>

          {/* Event Picker */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">
              Associated Event <span className="text-gray-400">(optional)</span>
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">— No event —</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          {/* Event Name Overlay */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">
              Event Name Overlay <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g., 'Summer Gala'"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-600">
              This text will appear at the top of the story.
            </p>
          </div>

          {/* Day Counter */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">
              Day Counter <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={dayCounter}
              onChange={(e) => setDayCounter(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="e.g., 1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-600">
              If set, a red badge &quot;Day N&quot; will appear on the story.
            </p>
          </div>

          {/* Story Title */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">
              Story Title <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="For your reference"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-600">
              Used to track stories in your dashboard (not visible on Instagram).
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 items-start">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg border"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateStory}
              disabled={isGenerating || !selectedAssetId}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
              {isGenerating ? 'Generating...' : 'Generate Story'}
              {!isGenerating && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
