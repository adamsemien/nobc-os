function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function emailHashIdx(email?: string | null, range = 70): number {
  if (!email) return 1;
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return (h % range) + 1;
}

export function Avatar({
  name,
  email,
  photoUrl,
  size = 36,
  className = '',
}: {
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const src =
    photoUrl ??
    (email
      ? `https://i.pravatar.cc/${size * 2}?img=${emailHashIdx(email)}`
      : null);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full text-[11px] font-medium uppercase ${className}`}
      style={{
        width: size,
        height: size,
        background: 'var(--muted)',
        color: 'var(--text-secondary)',
      }}
    >
      {initials(name)}
    </span>
  );
}
