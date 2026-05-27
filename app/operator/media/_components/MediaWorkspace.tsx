'use client';
import { useDensity } from './useDensity';
import { MediaToolbar } from './MediaToolbar';
import { MediaGrid } from './MediaGrid';
import { FolderTree } from './FolderTree';
import { FilterPanel, type FilterOptions } from './FilterPanel';

/** Holds the shared density state across the toolbar + grid. */
export function MediaWorkspace({ options }: { options: FilterOptions }) {
  const [density, setDensity] = useDensity();
  return (
    <div className="flex h-[calc(100vh-60px)]">
      <FolderTree />
      <div className="flex flex-1 flex-col overflow-y-auto px-4">
        <MediaToolbar onDensity={setDensity} />
        <MediaGrid density={density} />
      </div>
      <FilterPanel options={options} />
    </div>
  );
}
