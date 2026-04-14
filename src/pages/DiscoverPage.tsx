import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, User, ChevronDown } from 'lucide-react'
import { getDiscover, saveCourseToHome, unsaveCourseFromHome, type DiscoverPayload } from '../lib/api'
import CourseCoverArt from '../components/CourseCoverArt'

type DiscoverCourse = DiscoverPayload['trends'][number]

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [userQuery, setUserQuery] = useState('')
  const [payload, setPayload] = useState<DiscoverPayload>({ trends: [], popular: [], humanities: [], categories: ['All'] })
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    document.title = 'Discover'
  }, [])

  const fetchDiscover = useCallback(async (nextQuery = query, nextCategory = category, nextUserQuery = userQuery) => {
    setLoading(true)
    try {
      const data = await getDiscover({ query: nextQuery, category: nextCategory, author: nextUserQuery })
      setPayload(data)
    } catch {
      setPayload({ trends: [], popular: [], humanities: [], categories: ['All'] })
    } finally {
      setLoading(false)
    }
  }, [query, category, userQuery])

  useEffect(() => {
    void fetchDiscover(query, category, userQuery)
  }, [query, category, userQuery, fetchDiscover])

  async function toggleSavedCourse(courseId: string, isSaved: boolean) {
    setSaveError('')
    setSavingIds(prev => ({ ...prev, [courseId]: true }))
    try {
      if (isSaved) {
        await unsaveCourseFromHome(courseId)
      } else {
        await saveCourseToHome(courseId)
      }
      await fetchDiscover(query, category, userQuery)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : isSaved ? 'Could not remove saved course' : 'Could not save course')
    } finally {
      setSavingIds(prev => ({ ...prev, [courseId]: false }))
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 border rounded-full px-3 py-2 min-w-[220px]">
          <Search className="size-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search courses"
            className="outline-none bg-transparent w-56"
          />
        </label>

        <div className="relative">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="appearance-none border rounded-full pl-3 pr-8 py-2"
          >
            {payload.categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none size-4 absolute right-2 top-1/2 -translate-y-1/2" />
        </div>

        <label className="flex items-center gap-2 border rounded-full px-3 py-2 min-w-[200px]">
          <User className="size-4" />
          <input
            value={userQuery}
            onChange={e => setUserQuery(e.target.value)}
            placeholder="Find User"
            className="outline-none bg-transparent w-48"
          />
        </label>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Action failed: {saveError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-600">Loading discover content...</p>
      ) : (
        <>
          <Section
            title="Trends"
            courses={payload.trends}
            emptyHint="No trending courses match filters."
            savingIds={savingIds}
            onSave={toggleSavedCourse}
          />
          <Section
            title="Popular in Poland"
            courses={payload.popular}
            emptyHint="No popular courses for Poland match filters."
            savingIds={savingIds}
            onSave={toggleSavedCourse}
          />
          <Section
            title="History & Humanities picks"
            courses={payload.humanities}
            emptyHint="No history or humanities picks match filters."
            savingIds={savingIds}
            onSave={toggleSavedCourse}
          />
        </>
      )}
    </section>
  )
}

function Section({
  title,
  courses,
  emptyHint,
  savingIds,
  onSave,
}: {
  title: string;
  courses: DiscoverCourse[];
  emptyHint: string;
  savingIds: Record<string, boolean>;
  onSave: (courseId: string, isSaved: boolean) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{title}:</h2>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max snap-x snap-mandatory gap-4">
        {courses.map(c => (
          <DiscoverCard
            key={c.id}
            course={c}
            saving={Boolean(savingIds[c.id])}
            onSave={onSave}
          />
        ))}
          {courses.length === 0 ? (
            <div className="grid min-h-[220px] w-full min-w-[320px] place-items-center rounded-2xl border border-dashed border-neutral-300 bg-white/70 text-center">
              <p className="text-sm text-neutral-600">{emptyHint}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DiscoverCard({
  course,
  saving,
  onSave,
}: {
  course: DiscoverCourse;
  saving: boolean;
  onSave: (courseId: string, isSaved: boolean) => Promise<void>;
}) {
  const navigate = useNavigate()
  const isSaved = Boolean(course.saved)
  const isEnrolled = Boolean(course.enrolled)
  const accessMode = course.accessMode || (course.accessType === 'paid' ? 'public-paid' : 'public-free')
  const isPaid = accessMode === 'public-paid'

  function openPreview() {
    navigate(`/course/${course.id}?mode=preview`)
  }

  return (
    <article className="flex min-h-[290px] w-[320px] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={openPreview} className="block text-left">
        <CourseCoverArt
          title={course.title}
          category={course.category}
          thumbnailUrl={course.thumbnailUrl}
          templateKey={course.templateKey}
          className="h-[128px] w-full rounded-xl"
        />
      </button>
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <span className={[
            'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
            accessMode === 'class-only' ? 'border-sky-200 bg-sky-50 text-sky-800' : isPaid ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}>{accessMode === 'class-only' ? 'Class only' : isPaid ? 'Paid' : 'Free'}</span>
          {isPaid && course.priceCents ? (
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
              {(course.priceCents / 100).toFixed(2)} {course.currency || 'PLN'}
            </span>
          ) : null}
        </div>
        <button type="button" onClick={openPreview} className="m-0 line-clamp-2 text-left text-lg font-semibold leading-tight text-neutral-950 hover:text-neutral-700">{course.title}</button>
        {course.authorId && !course.authorProfileBlocked ? (
          <Link to={`/profile/${course.authorId}`} className="line-clamp-1 text-sm text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline">
            {course.author}
          </Link>
        ) : (
          <div className="line-clamp-1 text-sm text-neutral-600">{course.author}</div>
        )}
      </div>
      <div className="mt-auto flex items-center gap-2">
        <button type="button" onClick={openPreview} className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50">Preview</button>
        {isEnrolled ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Enrolled</span> : null}
        <button
          onClick={() => onSave(course.id, isSaved)}
          disabled={saving}
          className={[
            'inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-70',
            isSaved ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-neutral-50',
          ].join(' ')}
        >
          {saving ? (isSaved ? 'Removing...' : 'Saving...') : isSaved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  )
}

