import type { Domain } from "./types";

export type StarterTopic = {
  slug: string;
  title: string;
  domain: Domain;
  /** Short evocative hook shown on the home screen. */
  hook: string;
};

/**
 * Evocative starting points so nobody faces a blank box. These double as the
 * seed set for the pre-bake script.
 */
export const STARTER_TOPICS: StarterTopic[] = [
  {
    slug: "black-hole",
    title: "Black hole",
    domain: "science",
    hook: "Where gravity wins and light can't leave.",
  },
  {
    slug: "printing-press",
    title: "Printing press",
    domain: "history",
    hook: "The machine that mass-produced ideas.",
  },
  {
    slug: "quantum-entanglement",
    title: "Quantum entanglement",
    domain: "science",
    hook: "Two particles, one spooky destiny.",
  },
  {
    slug: "fall-of-the-western-roman-empire",
    title: "Fall of the Western Roman Empire",
    domain: "history",
    hook: "How the ancient world quietly ended.",
  },
  {
    slug: "entropy",
    title: "Entropy",
    domain: "science",
    hook: "Why time only runs one way.",
  },
  {
    slug: "silk-road",
    title: "Silk Road",
    domain: "history",
    hook: "The original world wide web of goods.",
  },
];

/** A broader seed list for the pre-bake batch (top common paths). */
export const PREBAKE_SEEDS: { slug: string; title: string; domain: Domain }[] = [
  ...STARTER_TOPICS.map(({ slug, title, domain }) => ({ slug, title, domain })),
  { slug: "dna", title: "DNA", domain: "science" },
  { slug: "evolution", title: "Evolution", domain: "science" },
  { slug: "photosynthesis", title: "Photosynthesis", domain: "science" },
  { slug: "general-relativity", title: "General relativity", domain: "science" },
  { slug: "periodic-table", title: "Periodic table", domain: "science" },
  { slug: "neuron", title: "Neuron", domain: "science" },
  { slug: "plate-tectonics", title: "Plate tectonics", domain: "science" },
  { slug: "vaccine", title: "Vaccine", domain: "science" },
  { slug: "antibiotic", title: "Antibiotic", domain: "science" },
  { slug: "big-bang", title: "Big Bang", domain: "science" },
  { slug: "renaissance", title: "Renaissance", domain: "history" },
  { slug: "industrial-revolution", title: "Industrial Revolution", domain: "history" },
  { slug: "french-revolution", title: "French Revolution", domain: "history" },
  { slug: "roman-empire", title: "Roman Empire", domain: "history" },
  { slug: "ancient-egypt", title: "Ancient Egypt", domain: "history" },
  { slug: "world-war-i", title: "World War I", domain: "history" },
  { slug: "cold-war", title: "Cold War", domain: "history" },
  { slug: "age-of-discovery", title: "Age of Discovery", domain: "history" },
  { slug: "gutenberg-bible", title: "Gutenberg Bible", domain: "history" },
  { slug: "scientific-revolution", title: "Scientific Revolution", domain: "history" },
];
