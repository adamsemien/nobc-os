"use client";

import React from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
        {hint && <span className="text-xs text-muted/70">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-border bg-panel-2 px-3.5 py-3 text-ink outline-none transition-colors focus:border-gold/70 placeholder:text-muted";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputBase} min-h-[90px] resize-y leading-relaxed ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${inputBase} appearance-none bg-[length:14px] bg-[right_0.9rem_center] bg-no-repeat pr-9 ${props.className ?? ""}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238f897d' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
}) {
  const variants: Record<string, string> = {
    primary: "bg-gold text-bg font-semibold hover:bg-gold/90 disabled:opacity-40",
    outline: "border border-border-strong text-ink hover:border-gold/60 hover:text-gold",
    ghost: "text-muted hover:text-ink",
    danger: "text-red-400/80 hover:text-red-400",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition-colors active:scale-[0.98] disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-gold" : "bg-border-strong"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-panel p-4 ${className}`}>{children}</div>
  );
}

export function SectionTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-2xl text-ink">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}
