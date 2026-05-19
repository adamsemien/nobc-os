/** Route-level loading placeholder — shaped skeleton, never a spinner.
 *  Mirrors Producer's <SectionSkeleton lines={…} />. Uses the themed
 *  `.skeleton` shimmer class from globals.css, so it repaints per theme. */
export function SectionSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="px-6 pb-16 pt-8 lg:px-10" aria-hidden>
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="skeleton mb-8 h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
