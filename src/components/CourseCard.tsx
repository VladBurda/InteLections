import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreVertical, Star } from 'lucide-react'
import CourseCoverArt from './CourseCoverArt'
import type { Course } from '../types/course'

type CourseCardProps = {
  course: Course
  onRemove?: (courseId: string) => Promise<void> | void
  onToggleStar?: (courseId: string) => Promise<void> | void
  removing?: boolean
  togglingStar?: boolean
}

export default function CourseCard({
  course,
  onRemove,
  onToggleStar,
  removing = false,
  togglingStar = false,
}: CourseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', onPointerDown)
    }

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [menuOpen])

  async function handleRemove() {
    if (!onRemove) return

    const firstCheck = window.confirm('Remove this course from Home?')
    if (!firstCheck) return

    const secondCheck = window.confirm('Please confirm again: remove this course from Home list?')
    if (!secondCheck) return

    await onRemove(course.id)
    setMenuOpen(false)
  }

  return (
    <article className="relative rounded-2xl border border-neutral-200 bg-white shadow-sm min-h-[320px] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="text-xs px-2 py-1 rounded-full border bg-neutral-50 border-neutral-200 text-neutral-600">
          Saved
        </span>

        <div className="flex items-center gap-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => onToggleStar?.(course.id)}
            disabled={togglingStar}
            title={course.starred ? 'Unstar' : 'Star'}
            className={['p-1.5 rounded-md', course.starred ? 'text-amber-500' : 'hover:bg-neutral-100', togglingStar ? 'opacity-60' : ''].join(' ')}
          >
            <Star className="size-4" fill={course.starred ? 'currentColor' : 'none'} />
          </button>

          <button
            aria-label="Card menu"
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-md hover:bg-neutral-100"
            title="More"
          >
            <MoreVertical className="size-4" />
          </button>

          {menuOpen && onRemove && (
            <div className="absolute right-4 top-12 w-44 rounded-xl border border-neutral-200 bg-white shadow-sm p-1 z-10">
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={removing}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:opacity-60"
              >
                {removing ? 'Removing...' : 'Remove from Home'}
              </button>
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
        <h3 className="text-lg font-semibold m-0">{course.title}</h3>
        <div className="text-sm text-neutral-600">{course.author}</div>
      </div>

      <div className="mt-auto flex gap-2">
        <Link
          className="px-4 py-2 rounded-xl border hover:bg-neutral-50"
          to={`/course/${course.id}`}
        >
          View Course
        </Link>
      </div>
    </article>
  )
}
