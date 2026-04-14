import { useEffect, useMemo, useState } from 'react'
import CourseCard from '../components/CourseCard'
import type { Course } from '../types/course'
import { getHomeCourses, removeHomeCourse, toggleProductStar } from '../lib/api'

type HomeSort = 'title-asc' | 'title-desc' | 'author-asc' | 'favourites-first' | 'recently-added'

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<HomeSort>('recently-added')
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [togglingStarId, setTogglingStarId] = useState<string | null>(null)
  const [homeError, setHomeError] = useState('')

  async function loadCourses(nextQuery = query) {
    setLoading(true)
    try {
      const payload = await getHomeCourses(nextQuery)
      setCourses(payload)
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const payload = await getHomeCourses(query)
        if (!cancelled) setCourses(payload)
      } catch {
        if (!cancelled) setCourses([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [query])

  async function handleRemove(courseId: string) {
    setHomeError('')
    setRemovingId(courseId)
    try {
      await removeHomeCourse(courseId)
      await loadCourses(query)
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : 'Could not remove course')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleToggleStar(courseId: string) {
    setHomeError('')
    setTogglingStarId(courseId)
    try {
      await toggleProductStar(courseId)
      await loadCourses(query)
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : 'Could not update favourite')
    } finally {
      setTogglingStarId(null)
    }
  }

  const sortedCourses = useMemo(() => {
    const items = [...courses]

    if (sortBy === 'title-asc') {
      items.sort((a, b) => a.title.localeCompare(b.title))
    }
    if (sortBy === 'title-desc') {
      items.sort((a, b) => b.title.localeCompare(a.title))
    }
    if (sortBy === 'author-asc') {
      items.sort((a, b) => a.author.localeCompare(b.author))
    }
    if (sortBy === 'favourites-first') {
      items.sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)))
    }
    if (sortBy === 'recently-added') {
      items.sort((a, b) => Number(b.addedSeq || 0) - Number(a.addedSeq || 0))
    }

    return items
  }, [courses, sortBy])

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by title or author"
          className="w-full max-w-md rounded-full border px-4 py-2"
        />

        <label className="flex items-center gap-2 rounded-full border px-3 py-2">
          <span className="text-sm text-neutral-600">Sort</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as HomeSort)}
            className="bg-transparent outline-none"
          >
            <option value="recently-added">Recently added</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
            <option value="author-asc">Author A-Z</option>
            <option value="favourites-first">Favourites first</option>
          </select>
        </label>
      </div>

      {homeError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Action failed: {homeError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-600">Loading courses...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {sortedCourses.map(c => (
            <CourseCard
              key={c.id}
              course={c}
              onRemove={handleRemove}
              onToggleStar={handleToggleStar}
              removing={removingId === c.id}
              togglingStar={togglingStarId === c.id}
            />
          ))}
          {sortedCourses.length === 0 && (
            <div className="col-span-full grid place-items-center text-center py-16 border border-dashed rounded-2xl">
              <p className="text-lg">No saved courses yet.</p>
              <p className="text-sm text-neutral-600">Go to Discover and save a course to show it here.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

