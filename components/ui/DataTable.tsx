import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

export function DataTableShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-border bg-surface ${className}`}
    >
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr
        className="border-b border-border"
        style={{ background: 'var(--surface-elevated, var(--surface))' }}
      >
        {children}
      </tr>
    </thead>
  );
}

export function DataTableHeader({
  children,
  align = 'left',
  className = '',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={`h-9 px-4 text-[10px] uppercase tracking-[0.12em] font-semibold whitespace-nowrap text-text-tertiary ${
        align === 'right'
          ? 'text-right'
          : align === 'center'
            ? 'text-center'
            : 'text-left'
      } ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function DataTableRow({
  children,
  onClick,
  selected = false,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      data-selected={selected || undefined}
      className={`group border-b border-border last:border-b-0 transition-colors duration-[120ms] ${
        onClick ? 'cursor-pointer' : ''
      } hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] data-[selected]:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] ${className}`}
    >
      {children}
    </tr>
  );
}

export type CellTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'success'
  | 'danger';

export function DataTableCell({
  children,
  align = 'left',
  tone = 'primary',
  className = '',
  colSpan,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  tone?: CellTone;
  colSpan?: number;
}) {
  const toneColor =
    tone === 'secondary'
      ? 'var(--text-secondary)'
      : tone === 'tertiary'
        ? 'var(--text-tertiary, var(--text-muted))'
        : tone === 'success'
          ? 'var(--success)'
          : tone === 'danger'
            ? 'var(--danger)'
            : 'var(--text-primary)';
  const rightOrNumeric =
    align === 'right' || tone === 'success' || tone === 'danger';
  return (
    <td
      colSpan={colSpan}
      className={`px-4 h-11 align-middle ${
        align === 'right'
          ? 'text-right tabular-nums'
          : align === 'center'
            ? 'text-center'
            : rightOrNumeric
              ? 'tabular-nums'
              : ''
      } ${className}`}
      style={{ color: toneColor }}
      {...rest}
    >
      {children}
    </td>
  );
}

export function DataTableAddRow({
  label,
  onClick,
  colSpan = 1,
}: {
  label: string;
  onClick: () => void;
  colSpan?: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          onClick={onClick}
          className="block w-full px-4 py-2.5 text-[12px] font-medium text-text-secondary border-t border-dashed border-border hover:border-solid hover:text-text-primary transition-colors"
          style={{
            background: 'transparent',
          }}
        >
          + {label}
        </button>
      </td>
    </tr>
  );
}
