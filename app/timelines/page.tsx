import Link from "next/link";
import TimelineSearch from "@/components/timelines/TimelineSearch";

export default function TimelinesHomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 py-16">
      <div className="mb-10 text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Tapsa Timelines
        </p>
        <h1 className="font-serif text-4xl font-medium tracking-tight text-ink md:text-5xl">
          Travel through time
        </h1>
        <p className="mx-auto mt-4 max-w-md text-balance text-base leading-relaxed text-ink-muted md:text-lg">
          Enter any topic — a country, technology, sport, or practice — and scroll
          through its history. Events animate into view as you move forward through
          time.
        </p>
      </div>

      <div className="w-full">
        <TimelineSearch />
      </div>

      <p className="mt-10 text-center text-xs text-ink-faint">
        <Link href="/" className="underline-offset-2 hover:text-ink-muted hover:underline">
          ← Back to the knowledge map
        </Link>
      </p>

      <footer className="mt-12 text-center text-xs text-ink-faint">
        Sourced from Wikipedia · No account, no ads
      </footer>
    </main>
  );
}
