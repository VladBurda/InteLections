import { useMemo, useState } from 'react'
import CourseCard, { type Course } from '../components/CourseCard'

const MOCK_COURSES: Course[] = [
  { id: '1', title: 'World History: 18th Century', author: 'Dr. Anna Kowalska' },
  { id: '2', title: 'Ancient Civilizations', author: 'J. Nowak' },
  { id: '3', title: 'Modern Europe 1900–1945', author: 'Prof. M. Zieliński' },
]

export default function HomePage() {
  const [query, setQuery] = useState('')

  const courses = useMemo(
    () =>
      MOCK_COURSES.filter(c =>
        [c.title, c.author].some(t => t.toLowerCase().includes(query.toLowerCase())),
      ),
    [query],
  )

  return (
    <section>
      <div className="mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by title or author"
          className="w-full max-w-md rounded-full border px-4 py-2"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {courses.map(c => (
          <CourseCard key={c.id} course={c} />
        ))}
        {courses.length === 0 && (
          <div className="col-span-full grid place-items-center text-center py-16 border border-dashed rounded-2xl">
            <p className="text-lg">No courses found.</p>
            <p className="text-sm text-neutral-600">Try adjusting your search or check "Discover".</p>
          </div>
        )}
      </div>
    </section>
  )
}
