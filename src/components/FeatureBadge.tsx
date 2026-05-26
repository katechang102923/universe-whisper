export function FeatureBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-lavender/25 bg-white/8 px-3 py-1 text-xs text-lavender">
      {children}
    </span>
  );
}
