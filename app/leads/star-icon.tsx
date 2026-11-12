// The special-lead pin shape — used for the map's select-mode markers,
// the list view and filter chips, so a star means the same thing
// everywhere. The map's GPU layer draws the same star (leads-map.tsx).
export const STAR_PATH =
  "M12 1.8l2.95 6.6 7.2.75-5.4 4.85 1.53 7.08L12 17.43 5.72 21.08l1.53-7.08-5.4-4.85 7.2-.75z";

export function StarIcon({
  color,
  className,
  stroke = "#ffffff",
}: {
  color: string;
  className?: string;
  stroke?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={STAR_PATH} fill={color} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}
