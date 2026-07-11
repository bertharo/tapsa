"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Gathering sources from Wikipedia…",
  "Finding dates and turning points…",
  "Laying out the eras…",
  "Building out event cards…",
  "Polishing the historian's notes…",
];

export default function TimelineBuildingStatus({
  title,
  className = "",
}: {
  title: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={className}>
      <p className="text-sm text-white/70">
        Building out <span className="text-white/90">{title}</span>…
      </p>
      <p className="mt-1 text-xs text-white/45 transition-opacity duration-500" aria-live="polite">
        {STEPS[step]} First visit can take 20–60 seconds.
      </p>
    </div>
  );
}
