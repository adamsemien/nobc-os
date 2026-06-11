/** ArchetypeChip — read-only display pill for a member archetype (tranche S).
 *
 *  Spec (Form §8):
 *    rounded-full px-2.5 py-0.5 text-[11px] font-medium
 *    bg-raised text-text-secondary border border-border
 *
 *  No per-archetype colour logic — one style, all archetypes.
 *  Renders nothing when `archetype` is null/empty.
 */

type Props = { archetype: string | null | undefined };

export function ArchetypeChip({ archetype }: Props) {
  if (!archetype) return null;

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        background: 'var(--raised)',
        color: 'var(--text-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {archetype}
    </span>
  );
}
