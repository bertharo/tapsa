import type { EventCategory } from "@/lib/timeline-types";

type GlyphProps = { className?: string };

const GLYPHS: Record<EventCategory, (p: GlyphProps) => JSX.Element> = {
  SCIENCE: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="28" r="10" fill="none" stroke="#45b8be" strokeWidth="2" className="category-glyph-animate" />
      <path d="M18 14 L24 8 L30 14" fill="none" stroke="#c9a24b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="6" r="2" fill="#d1603d" />
    </svg>
  ),
  MATHEMATICS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <text x="8" y="32" fontSize="28" fill="#8a7bdc" fontFamily="serif" className="category-glyph-animate">∑</text>
    </svg>
  ),
  PHYSICS: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#45b8be" strokeWidth="1.5" className="category-glyph-animate" />
      <ellipse cx="24" cy="24" rx="6" ry="14" fill="none" stroke="#d1603d" strokeWidth="1.5" className="category-glyph-animate" style={{ animationDelay: "0.5s" }} />
      <circle cx="24" cy="24" r="3" fill="#c9a24b" />
    </svg>
  ),
  ASTRONOMY: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="8" fill="#c9a24b" opacity="0.3" className="category-glyph-animate" />
      <path d="M24 6 L26 20 L40 24 L26 28 L24 42 L22 28 L8 24 L22 20 Z" fill="#d1603d" opacity="0.85" className="category-glyph-animate" />
    </svg>
  ),
  OBSERVATION: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="12" fill="none" stroke="#7aa05a" strokeWidth="2" className="category-glyph-animate" />
      <circle cx="24" cy="24" r="4" fill="#45b8be" />
      <line x1="24" y1="4" x2="24" y2="10" stroke="#c9a24b" strokeWidth="2" />
    </svg>
  ),
  PHILOSOPHY: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="16" r="8" fill="none" stroke="#8a7bdc" strokeWidth="2" className="category-glyph-animate" />
      <path d="M12 40 Q24 28 36 40" fill="none" stroke="#8a7bdc" strokeWidth="2" />
    </svg>
  ),
  CULTURE: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 36 Q16 12 24 20 Q32 12 40 36" fill="none" stroke="#d1603d" strokeWidth="2" className="category-glyph-animate" />
      <circle cx="24" cy="20" r="3" fill="#c9a24b" />
    </svg>
  ),
  TECHNOLOGY: ({ className }) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="10" y="14" width="28" height="20" rx="3" fill="none" stroke="#45b8be" strokeWidth="2" className="category-glyph-animate" />
      <circle cx="24" cy="24" r="5" fill="none" stroke="#7aa05a" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="2" fill="#d1603d" />
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
