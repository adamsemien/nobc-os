import ApplyAuthChrome from './_components/ApplyAuthChrome';

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="nobc">
      <ApplyAuthChrome />
      {children}
    </div>
  );
}
