'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OperatorRole } from '@prisma/client';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
// Minimal RBAC (Phase 1.5): role labels + the assignable set are the single source
// of truth in lib/auth/can (READ_ONLY shows as "Viewer"; never expose raw enums).
import { ROLE_LABEL as ROLE_LABELS, ASSIGNABLE_ROLES as ROLES } from '@/lib/auth/can';

export type TeamMemberDTO = {
  id: string;
  email: string;
  name: string;
  role: OperatorRole;
  pending: boolean;
  createdAt: string;
};

const inputCls =
  'rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30';

export function TeamManager({
  members,
  canManage,
}: {
  members: TeamMemberDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OperatorRole>(OperatorRole.STAFF);
  const [inviting, setInviting] = useState(false);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setError(null);
    const res = await fetch(url, init);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Something went wrong.');
      return false;
    }
    return true;
  }

  async function changeRole(id: string, role: OperatorRole) {
    setBusyId(id);
    const ok = await call(`/api/operator/team/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setBusyId(null);
    if (ok) router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id);
    const ok = await call(`/api/operator/team/${id}`, { method: 'DELETE' });
    setBusyId(null);
    if (ok) router.refresh();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    const ok = await call('/api/operator/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role: inviteRole }),
    });
    setInviting(false);
    if (ok) {
      setEmail('');
      setInviteRole(OperatorRole.STAFF);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <form onSubmit={invite} className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium text-text-primary">Invite a team member</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`flex-1 ${inputCls}`}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OperatorRole)}
              className={inputCls}
              aria-label="Invite role"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Invite
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            No email is sent yet — the invite is stored and activates when they sign in.
          </p>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Role</th>
              {canManage ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="text-text-primary">{m.name || m.email}</div>
                  {m.name ? <div className="text-xs text-text-muted">{m.email}</div> : null}
                  {m.pending ? (
                    <span className="mt-1 inline-block rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                      Invited
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m.id, e.target.value as OperatorRole)}
                      className={`${inputCls} py-1.5`}
                      aria-label={`Role for ${m.email}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-text-secondary">{ROLE_LABELS[m.role]}</span>
                  )}
                </td>
                {canManage ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      disabled={busyId === m.id}
                      aria-label={`Remove ${m.email}`}
                      className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-danger disabled:opacity-50"
                    >
                      {busyId === m.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">No team members yet.</p>
        ) : null}
      </div>
    </div>
  );
}
