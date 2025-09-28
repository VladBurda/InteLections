import { Plus } from 'lucide-react';

export default function AddCourseCard({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-100/60 hover:bg-neutral-100 transition-colors w-full h-full min-h-[260px] grid place-items-center"
      title="Add Course"
    >
      <div className="flex flex-col items-center gap-2">
        <Plus className="size-7" />
        <span className="text-xl font-semibold">Add Course</span>
      </div>
    </button>
  );
}
