import type { EventCategory } from "@/lib/timeline-types";

type GlyphProps = { className?: string };

const GLYPHS: Record<EventCategory, (p: GlyphProps) => JSX.Element> = {
  MILITARY: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M24 8 L30 18 L42 20 L33 28 L35 40 L24 34 L13 40 L15 28 L6 20 L18 18 Z" fill="none" stroke="#d1603d" strokeWidth="2" className="category-glyph-animate" />
    </svg>
  ),
  POLITICS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="14" y="22" width="20" height="16" fill="none" stroke="#8a7bdc" strokeWidth="2" className="category-glyph-animate" />
      <path d="M18 22 L24 10 L30 22" fill="none" stroke="#c9a24b" strokeWidth="2" />
    </svg>
  ),
  SCIENCE: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="28" r="10" fill="none" stroke="#45b8be" strokeWidth="2" className="category-glyph-animate" />
      <path d="M18 14 L24 8 L30 14" fill="none" stroke="#c9a24b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="6" r="2" fill="#d1603d" />
    </svg>
  ),
  CULTURE: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 36 Q16 12 24 20 Q32 12 40 36" fill="none" stroke="#d1603d" strokeWidth="2" className="category-glyph-animate" />
      <circle cx="24" cy="20" r="3" fill="#c9a24b" />
    </svg>
  ),
  ECONOMY: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M10 32 L18 20 L26 28 L34 16 L38 32" fill="none" stroke="#7aa05a" strokeWidth="2" className="category-glyph-animate" />
    </svg>
  ),
  SOCIETY: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="18" cy="18" r="5" fill="none" stroke="#45b8be" strokeWidth="2" className="category-glyph-animate" />
      <circle cx="30" cy="18" r="5" fill="none" stroke="#45b8be" strokeWidth="2" />
      <path d="M12 36 Q24 28 36 36" fill="none" stroke="#c9a24b" strokeWidth="2" />
    </svg>
  ),
};

export default function CategoryGlyph({
  category,
  className = "",
}: {
  category: EventCategory;
  className?: string;
}) {
  const Glyph = GLYPHS[category] ?? GLYPHS.SCIENCE;
  return (
    <div
      className={`category-glyph flex items-center justify-center rounded-xl bg-ink/5 p-1 ${className}`}
      aria-hidden
    >
      <Glyph className="h-full w-full" />
    </div>
  );
}
