# Tapsa

A navigable knowledge graph for the curious. Enter any topic in science or
history and travel a living map of connected ideas — including the adjacent
concepts you didn't know to ask about. No account, no ads.

> Core principle: **generate the connections, not the facts.** Facts are
> grounded in Wikipedia; an LLM ranks the interesting links and writes the
> "why this connects" framing.

## Stack

- **Next.js 14** (App Router) + **TypeScript** on Vercel
- **Tailwind CSS** — near-monochrome, type-led, one accent
- **framer-motion** — spring-based re-centering (the "magic" moment) + mobile collapse
- **Groq** (OpenAI-compatible, open models) — connection selection + voice (JSON mode, schema-validated). Repoint to any OpenAI-compatible provider via env.
- **Wikipedia REST + Action API** — factual grounding & the real link graph
- **Pluggable node store** — filesystem by default; swap for Postgres/KV in prod

## Architecture

```
User → Next.js → /api/node
                   ├─ 1. Cache check (NodeStore)           ── hit ──► return
                   ├─ 2. Fetch grounding from Wikipedia
                   ├─ 3. LLM: rewrite summary + pick connections
                   ├─ 4. Write node to cache (permanent)
                   └─ 5. Return node JSON
```

Key files:

| Path | Responsibility |
|------|----------------|
| `lib/wikipedia.ts` | Grounding: summary, related pages, outgoing links, autocomplete, noise filtering |
| `lib/llm.ts` | Connection engine: prompt, schema validation, retry, **no-key fallback** |
| `lib/node-service.ts` | The pipeline (cache → ground → generate → cache) + domain inference |
| `lib/cache.ts` | `NodeStore` interface + filesystem implementation |
| `lib/rate-limit.ts` | Soft per-IP limit on **cold** generations only |
| `lib/trail.ts` | URL trail encoding/decoding + share URLs |
| `components/GraphView.tsx` | Radial map, shared-layout spring recenter, mobile list |
| `components/Explorer.tsx` | Client state: travel, breadcrumb, share, URL sync |
| `app/api/node/route.ts` | Node endpoint (rate-limited cold gen, unlimited cached reads) |
| `app/api/og/route.tsx` | Shareable trail preview image |
| `scripts/prebake.ts` | Batch-generate the common paths on deploy |

## Setup

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY (optional but recommended)
npm run dev
```

Open http://localhost:3000.

**Without an API key** the app still runs end-to-end — connections are chosen by
a heuristic fallback instead of the LLM. Add `GROQ_API_KEY` to get the real
"most interesting / what you missed" selection that is the whole differentiation.

### Pre-bake common topics

```bash
npm run prebake
```

Generates and permanently caches the seed set in `lib/starter-topics.ts` so the
common paths are instant and free for the first visitors.

## Design decisions worth knowing

- **Custom radial layout + framer-motion** (not react-flow). The make-or-break is
  the physics-based re-center and graceful mobile collapse to a vertical list;
  a bespoke layout with shared `layoutId` animations gives precise control over
  exactly that moment.
- **Connections are constrained to real Wikipedia links.** The LLM may only
  choose slugs from the candidate set, which prevents dead/hallucinated links.
  Output is schema-validated (`zod`) with one retry on parse failure.
- **Exactly one "surprising" node** is guaranteed per node, even if the model
  slips — it gets a distinct glow ("what you missed").
- **Caching is permanent**, keyed by canonical slug. Cache hit rate + cold-gen
  origin are logged via `lib/metrics.ts`.

## Production swaps (v1 → scale)

- Replace `FileSystemStore` in `lib/cache.ts` with Postgres (Neon/Supabase) or
  Vercel KV — the `NodeStore` interface is the only thing call sites depend on.
- Replace the in-memory rate limiter with Upstash/Redis for multi-instance.
- Wire `lib/metrics.ts` into Vercel Analytics / an event log.
