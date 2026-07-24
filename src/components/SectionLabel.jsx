export default function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-px bg-brass" />
      <span className="font-tight text-xs uppercase tracking-[0.3em] text-brass/70">{children}</span>
    </div>
  );
}