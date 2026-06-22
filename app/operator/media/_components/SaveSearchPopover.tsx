'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSavedSearches } from './useSavedSearches';

export function SaveSearchPopover({
  currentParams,
  currentQ,
  onClose,
}: {
  currentParams: string;
  currentQ: string;
  onClose: () => void;
}) {
  const { save } = useSavedSearches();
  const [name, setName] = useState(currentQ || 'My search');
  const [savedOk, setSavedOk] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    save(name.trim(), currentParams);
    setSavedOk(true);
    setTimeout(onClose, 2000);
  };

  return (
    <div
      role="dialog"
      aria-label="Save current search"
      className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-[10px] p-4 font-[family-name:var(--font-dm-sans)]"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
          Save view
        </span>
        <button
          aria-label="Close"
          onClick={onClose}
          className="rounded-[4px] p-0.5 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {savedOk ? (
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }} aria-live="polite">
          View saved
        </p>
      ) : (
        <>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Name this view — e.g. Sponsor Recap, Best Portraits"
            className="mb-3 w-full rounded-[6px] border px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 rounded-[6px] px-3 py-1.5 text-[13px] font-medium focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              Save view
            </button>
            <button
              onClick={onClose}
              className="rounded-[6px] px-3 py-1.5 text-[13px] focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
