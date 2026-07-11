import { TopicPageSkeleton } from "@/components/NodeSkeleton";

export default function TopicLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-10 pt-4 md:px-6">
      <div className="flex flex-1 items-center justify-center py-4">
        <TopicPageSkeleton />
      </div>
    </main>
  );
}
