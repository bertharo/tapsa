"use client";

import Image from "next/image";

type TopicTeaserCardProps = {
  title: string;
  teaser: string;
  yearDisplay?: string;
  category?: string;
  imageUrl?: string;
  accentColor?: string;
  selected?: boolean;
  onClick?: () => void;
};

export function TopicTeaserCard({
  title,
  teaser,
  yearDisplay,
  category,
  imageUrl,
  accentColor = "var(--accent)",
  selected = false,
  onClick,
}: TopicTeaserCardProps) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group w-full rounded-2xl border bg-white text-left shadow-node transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        selected ? "border-accent/50 ring-2 ring-accent/20" : "border-ink/10 hover:border-accent/30"
      }`}
    >
      {imageUrl && (
        <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-paper-soft">
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover transition group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 400px"
            unoptimized
          />
        </div>
      )}
      <div className="p-4 sm:p-5">
        {(yearDisplay || category) && (
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: accentColor }}
          >
            {[yearDisplay, category].filter(Boolean).join(" · ")}
          </p>
        )}
        <h3 className="font-timeline-serif mt-1 text-lg font-medium leading-snug text-ink sm:text-xl">
          {title}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{teaser}</p>
      </div>
    </Tag>
  );
}

export function TopicTeaserCardSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-2xl border border-ink/5 bg-white shadow-node">
      <div className="h-36 rounded-t-2xl bg-paper-soft" />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="h-3 w-24 rounded bg-paper-soft" />
        <div className="h-5 w-4/5 rounded bg-paper-soft" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-paper-soft" />
          <div className="h-3 w-5/6 rounded bg-paper-soft" />
        </div>
      </div>
    </div>
  );
}
