import { Pencil, Star, MoreVertical } from 'lucide-react';
import type { ProductCourse } from '../types/product';

export default function ProductCard({
  course,
  onToggleStar,
}: {
  course: ProductCourse;
  onToggleStar?: (id: string) => void;
}) {
  const isDraft = course.status === 'Draft';

  return (
    <article className="relative rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 flex flex-col gap-3">
      {/* Header with status + actions */}
      <div className="flex items-start justify-between">
        <span
          className={[
            'text-xs px-2 py-1 rounded-full border',
            isDraft ? 'bg-neutral-50 border-neutral-200 text-neutral-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
          ].join(' ')}
        >
          {course.status}
        </span>

        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-md hover:bg-neutral-100" title="Edit">
            <Pencil className="size-4" />
          </button>
          <button
            className={['p-1.5 rounded-md', course.starred ? 'text-amber-500' : 'hover:bg-neutral-100'].join(' ')}
            title={course.starred ? 'Unstar' : 'Star'}
            onClick={() => onToggleStar?.(course.id)}
          >
            <Star className="size-4" fill={course.starred ? 'currentColor' : 'none'} />
          </button>
          <button className="p-1.5 rounded-md hover:bg-neutral-100" title="More">
            <MoreVertical className="size-4" />
          </button>
        </div>
      </div>

      {/* Thumbnail */}
      <div className="w-full h-[120px] rounded-xl bg-neutral-300" aria-hidden />

      {/* Title/author */}
      <div>
        <h3 className="text-lg font-semibold m-0">{course.title}</h3>
        <div className="text-sm text-neutral-600">{course.author}</div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-3">
        <a className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-neutral-200 font-semibold" href="#">
          View Course
        </a>
        <a className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-neutral-200 font-semibold" href="#">
          Statistics
        </a>
      </div>
    </article>
  );
}
