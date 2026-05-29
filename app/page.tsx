import Link from "next/link";
import SearchField from "@/components/SearchField";
import { STARTER_TOPICS } from "@/lib/starter-topics";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 py-16">
      <div className="mb-10 text-center">
        <h1 className="font-serif text-5xl font-medium tracking-tight text-ink md:text-6xl">
          Tapsa
        </h1>
        <p className="mx-auto mt-4 max-w-md text-balance text-base leading-relaxed text-ink-muted md:text-lg">
          A navigable map of ideas. Enter any topic in science or history and
          travel the connections — including the ones you didn&rsquo;t know to
          ask about.
        </p>
      </div>

      <div className="w-full">
        <SearchField />
      </div>

      <div className="mt-10 w-full">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-ink-faint">
          Or fall in somewhere
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {STARTER_TOPICS.map((t) => (
            <Link
              key={t.slug}
              href={`/topic/${t.slug}`}
              className="group rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink-soft shadow-sm transition hover:border-accent/40 hover:text-ink hover:shadow-node"
              title={t.hook}
            >
              {t.title}
            </Link>
          ))}
        </div>
      </div>

      <footer className="mt-16 text-center text-xs text-ink-faint">
        Sourced from Wikipedia · No account, no ads
      </footer>
    </main>
  );
}
