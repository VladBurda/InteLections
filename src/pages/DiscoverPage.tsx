import { useMemo, useState } from 'react'
import { Search, User, ChevronDown } from 'lucide-react'
import type { Course } from '../components/CourseCard'
type DiscoverCourse = Course & {
  category: string
  country?: string
}

const TRENDS: DiscoverCourse[] = [
  { id: 't1', title: 'Ancient Civilizations', author: 'J. Nowak', category: 'History' },
  { id: 't2', title: 'WWII — Key Battles', author: 'A. Lewandowski', category: 'History' },
  { id: 't3', title: 'Renaissance Art', author: 'M. Wysocka', category: 'Art' },
  { id: 't4', title: 'Intro to Philosophy', author: 'Z. Król', category: 'Humanities' },
]

const POPULAR_PL: DiscoverCourse[] = [
  { id: 'p1', title: 'Polish-Lithuanian Commonwealth', author: 'Dr. K. Zielińska', category: 'History', country: 'PL' },
  { id: 'p2', title: 'Partitions of Poland', author: 'B. Kowalczyk', category: 'History', country: 'PL' },
  { id: 'p3', title: 'Solidarity Movement', author: 'P. Nowicki', category: 'History', country: 'PL' },
  { id: 'p4', title: 'Geography of Poland', author: 'E. Kamińska', category: 'Geography', country: 'PL' },
]

const CATEGORIES = ['All', 'History', 'Art', 'Humanities', 'Geography']

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [userQuery, setUserQuery] = useState('')
  document.title = 'Discover'

  // filtr dla obu sekcji
  const filt = (c: DiscoverCourse) => {
    const matchesQuery = [c.title, c.author].some(t => t.toLowerCase().includes(query.toLowerCase()))
    const matchesCat = category === 'All' || c.category === category
    const matchesUser = userQuery.trim() === '' || c.author.toLowerCase().includes(userQuery.toLowerCase())
    return matchesQuery && matchesCat && matchesUser
  }

  const trends = useMemo(() => TRENDS.filter(filt), [query, category, userQuery])
  const popular = useMemo(() => POPULAR_PL.filter(filt), [query, category, userQuery])

  return (
    <section className="space-y-6">

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search courses */}
        <label className="flex items-center gap-2 border rounded-full px-3 py-2 min-w-[220px]">
          <Search className="size-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search courses"
            className="outline-none bg-transparent w-56"
          />
        </label>

        {/* Category */}
        <div className="relative">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="appearance-none border rounded-full pl-3 pr-8 py-2"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none size-4 absolute right-2 top-1/2 -translate-y-1/2" />
        </div>

        {/* Find user */}
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

      {/* Trends */}
      <Section title="Trends" courses={trends} emptyHint="No trending courses match filters." />

      {/* Popular in Poland */}
      <Section title="Popular in Poland" courses={popular} emptyHint="No popular courses for Poland match filters." />
    </section>
  )
}

function Section({ title, courses, emptyHint }: { title: string; courses: DiscoverCourse[]; emptyHint: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{title}:</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {courses.map(c => <DiscoverCard key={c.id} course={c} />)}
        {courses.length === 0 && (
          <div className="col-span-full grid place-items-center text-center py-16 border border-dashed rounded-2xl">
            <p className="text-sm text-neutral-600">{emptyHint}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Wariant karty dla Discover: z przyciskami Preview/Save */
function DiscoverCard({ course }: { course: DiscoverCourse }) {
  const [saved, setSaved] = useState(false)
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 flex flex-col gap-3">
      <div className="w-full h-[110px] rounded-xl bg-neutral-300" aria-hidden />
      <div>
        <h3 className="text-lg font-semibold m-0">{course.title}</h3>
        <div className="text-sm text-neutral-600">{course.author}</div>
      </div>
      <div className="mt-auto flex gap-2">
        <button className="px-4 py-2 rounded-xl border hover:bg-neutral-50">Preview</button>
        <button
          onClick={() => setSaved(s => !s)}
          className={[
            'px-4 py-2 rounded-xl border',
            saved ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-neutral-50',
          ].join(' ')}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  )
}
