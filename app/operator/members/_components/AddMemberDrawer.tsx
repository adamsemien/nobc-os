'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { DetailDrawer } from '@/components/ui';

export type CreatedMember = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  status: string;
  createdAt: string;
};

type MemberFormStatus = 'GUEST' | 'APPROVED' | 'PENDING';

// Display labels — never surface the raw enum in the UI (root CLAUDE.md terminology law).
const STATUS_OPTIONS: { value: MemberFormStatus; label: string }[] = [
  { value: 'GUEST', label: 'Guest' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING', label: 'Pending' },
];

const inputCls =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';
const labelCls = 'block text-xs font-medium text-text-secondary';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  status: 'GUEST' as MemberFormStatus,
  tags: '',
  aiSummary: '',
  note: '',
};

export function AddMemberDrawer({ onCreated }: { onCreated: (m: CreatedMember) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    setError(null);
    setForm(EMPTY);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    if (!firstName || !lastName || !email) {
      setError('First name, last name, and email are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/operator/members/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: form.phone.trim() || undefined,
          status: form.status,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          aiSummary: form.aiSummary.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        member?: CreatedMember;
        error?: string;
      };
      if (!res.ok || !payload.member) {
        setError(payload.error ?? 'Could not create member.');
        return;
      }
      onCreated(payload.member);
      setOpen(false);
      setForm(EMPTY);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add Member
      </button>

      <DetailDrawer
        open={open}
        onClose={close}
        title="Add member"
        ariaLabel="Add member"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-member-form"
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add member'}
            </button>
          </div>
        }
      >
        <form id="add-member-form" onSubmit={submit} className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="am-first" className={labelCls}>
                First name <span className="text-danger">*</span>
              </label>
              <input
                id="am-first"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                required
                autoComplete="off"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="am-last" className={labelCls}>
                Last name <span className="text-danger">*</span>
              </label>
              <input
                id="am-last"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                required
                autoComplete="off"
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="am-email" className={labelCls}>
              Email <span className="text-danger">*</span>
            </label>
            <input
              id="am-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              autoComplete="off"
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="am-phone" className={labelCls}>
              Phone
            </label>
            <input
              id="am-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+15125550123"
              autoComplete="off"
              className={inputCls}
            />
            <p className="text-[11px] text-text-muted">E.164 format, e.g. +15125550123</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="am-status" className={labelCls}>
              Status
            </label>
            <select
              id="am-status"
              value={form.status}
              onChange={(e) => set('status', e.target.value as MemberFormStatus)}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="am-tags" className={labelCls}>
              Tags
            </label>
            <input
              id="am-tags"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="founder, austin, vip"
              autoComplete="off"
              className={inputCls}
            />
            <p className="text-[11px] text-text-muted">Comma-separated.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="am-summary" className={labelCls}>
              AI summary
            </label>
            <textarea
              id="am-summary"
              value={form.aiSummary}
              onChange={(e) => set('aiSummary', e.target.value)}
              rows={3}
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="am-note" className={labelCls}>
              Note to yourself
            </label>
            <textarea
              id="am-note"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              rows={2}
              className={inputCls}
            />
            <p className="text-[11px] text-text-muted">Scratch pad — not saved.</p>
          </div>
        </form>
      </DetailDrawer>
    </>
  );
}
