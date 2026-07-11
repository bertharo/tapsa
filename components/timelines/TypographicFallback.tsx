"use client";

type Props = {
  yearDisplay: string;
  accentColor?: string;
  className?: string;
};

/** Typographic panel when no adequate Wikipedia image exists. */
export default function TypographicFallback({
  yearDisplay,
  accentColor = "#d1603d",
  className = "",
}: Props) {
  return (
    <div
      className={`flex h-36 w-full items-center justify-center rounded-t-2xl ${className}`}
      style={{
        background: `linear-gradient(135deg, ${accentColor}33 0%, ${accentColor}11 50%, rgba(255,255,255,0.04) 100%)`,
        borderBottom: `1px solid ${accentColor}44`,
      }}
    >
      <span
        className="font-timeline-serif text-4xl font-medium tabular-nums tracking-tight text-white/90 md:text-5xl"
        style={{ color: accentColor }}
      >
        {yearDisplay}
      </span>
    </div>
  );
}
