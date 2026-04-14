import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Share2, Star, MoreVertical, Trash2, BarChart3, UploadCloud } from 'lucide-react';
import type { ProductCourse } from '../types/product';
import CourseCoverArt from './CourseCoverArt';

type ProductCardProps = {
  course: ProductCourse;
  onToggleStar?: (id: string) => void;
  onEdit?: (course: ProductCourse) => void;
  onDelete?: (course: ProductCourse) => Promise<void> | void;
  onShare?: (course: ProductCourse) => Promise<void> | void;
  onStatistics?: (course: ProductCourse) => Promise<void> | void;
  onPublish?: (course: ProductCourse) => Promise<void> | void;
  onUnpublish?: (course: ProductCourse) => Promise<void> | void;
  publishBlockedReason?: string;
  deleting?: boolean;
  sharing?: boolean;
  openingStats?: boolean;
  publishing?: boolean;
};

type MenuAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
};

export default function ProductCard({
  course,
  onToggleStar,
  onEdit,
  onDelete,
  onShare,
  onStatistics,
  onPublish,
  onUnpublish,
  publishBlockedReason = '',
  deleting = false,
  sharing = false,
  openingStats = false,
  publishing = false,
}: ProductCardProps) {
  const isDraft = course.status === 'Non posted';
  const accessMode = course.accessMode || (course.accessType === 'paid' ? 'public-paid' : 'public-free');
  const isPaid = accessMode === 'public-paid';
  const publishBlocked = Boolean(isDraft && publishBlockedReason);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', onPointerDown);
    }

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [menuOpen]);

  const menuActions = useMemo<MenuAction[]>(() => [
    ...(isDraft ? [{
      id: 'publish',
      label: publishing ? 'Publishing...' : 'Publish course',
      icon: <UploadCloud className="size-4" />,
      onSelect: () => {
        void onPublish?.(course);
        setMenuOpen(false);
      },
      disabled: publishing || publishBlocked,
    }] : [{
      id: 'unpublish',
      label: publishing ? 'Unpublishing...' : 'Unpublish course',
      icon: <UploadCloud className="size-4" />,
      onSelect: () => {
        void onUnpublish?.(course);
        setMenuOpen(false);
      },
      disabled: publishing,
    }]),
    {
      id: 'share',
      label: sharing ? 'Sharing...' : 'Share course',
      icon: <Share2 className="size-4" />,
      onSelect: () => {
        void onShare?.(course);
        setMenuOpen(false);
      },
      disabled: sharing,
    },
    {
      id: 'delete',
      label: deleting ? 'Deleting...' : 'Delete course',
      icon: <Trash2 className="size-4" />,
      onSelect: () => {
        void onDelete?.(course);
        setMenuOpen(false);
      },
      tone: 'danger',
      disabled: deleting,
    },
  ], [course, deleting, isDraft, onDelete, onPublish, onShare, onUnpublish, publishBlocked, publishing, sharing]);

  return (
    <article className="relative flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <span
          className={[
            'text-xs px-2 py-1 rounded-full border',
            isDraft ? 'bg-neutral-50 border-neutral-200 text-neutral-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
          ].join(' ')}
        >
          {course.status}
        </span>

        <div className="flex items-center gap-1" ref={menuRef}>
          <button className="rounded-md p-1.5 hover:bg-neutral-100" title="Edit course card" onClick={() => onEdit?.(course)}>
            <Pencil className="size-4" />
          </button>
          <button
            className={['rounded-md p-1.5', course.starred ? 'text-amber-500' : 'hover:bg-neutral-100'].join(' ')}
            title={course.starred ? 'Unstar' : 'Star'}
            onClick={() => onToggleStar?.(course.id)}
          >
            <Star className="size-4" fill={course.starred ? 'currentColor' : 'none'} />
          </button>
          <button className="rounded-md p-1.5 hover:bg-neutral-100" title="More" onClick={() => setMenuOpen(v => !v)}>
            <MoreVertical className="size-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
              <div className="border-b border-neutral-100 px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                Card actions
              </div>
              <div className="p-1.5">
                {menuActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onSelect}
                    disabled={action.disabled}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm disabled:opacity-60',
                      action.tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-neutral-700 hover:bg-neutral-100',
                    ].join(' ')}
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <CourseCoverArt
        title={course.title}
        category={course.category}
        thumbnailUrl={course.thumbnailUrl}
        templateKey={course.templateKey}
        className="h-[120px] w-full rounded-xl"
      />

      <div>
        <h3 className="m-0 text-lg font-semibold">{course.title}</h3>
        <div className="text-sm text-neutral-600">{course.author}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className={[
            'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
            accessMode === 'class-only' ? 'border-sky-200 bg-sky-50 text-sky-800' : isPaid ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}>
            {accessMode === 'class-only' ? 'Class only' : isPaid ? `Paid${course.priceCents ? ` - ${(course.priceCents / 100).toFixed(2)} ${course.currency || 'PLN'}` : ''}` : 'Free'}
          </span>
          {course.level ? (
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {course.level}
            </span>
          ) : null}
        </div>
        {publishBlocked ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-800">
            {publishBlockedReason}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex gap-3">
        <Link className="inline-flex items-center justify-center rounded-xl bg-neutral-200 px-4 py-2 font-semibold" to={`/course/${course.id}`}>
          Edit Course
        </Link>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-200 px-4 py-2 font-semibold"
          type="button"
          onClick={() => void onStatistics?.(course)}
          disabled={openingStats}
        >
          <BarChart3 className="size-4" />
          {openingStats ? 'Opening...' : 'Statistics'}
        </button>
      </div>
    </article>
  );
}


