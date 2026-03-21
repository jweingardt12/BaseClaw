const WIDTHS = [100, 92, 85, 78, 95, 88, 72, 80, 90, 75];

export function LoadingSkeleton({ lines = 4, height = "h-4" }: { lines?: number; height?: string }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${height} rounded-md bg-zinc-200 dark:bg-zinc-800 animate-pulse`}
          style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }}
        />
      ))}
    </div>
  );
}
