import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { BookOpen, Clock, Play, Star, Users, ChevronLeft } from 'lucide-react'
import { COURSE_ANCIENT, type CourseDetails, type Lesson } from '../data/course-details'

export default function CourseDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Prosty router danych: dla przykładu mamy tylko jeden kurs
  const course: CourseDetails | undefined = useMemo(() => {
    if (id === 'ancient-civ') return COURSE_ANCIENT
    // fallback: przekieruj do Discover jeśli id nieznane
    navigate('/discover', { replace: true })
    return undefined
  }, [id, navigate])

  // „Zapisany/Enrolled” stan lokalny
  const [enrolled, setEnrolled] = useState(false)

  if (!course) return null

  const totalMin = course.lessons.reduce((s, l) => s + l.durationMin, 0)

  return (
    <section className="space-y-6">
      {/* Back */}
      <Link to={-1 as any} className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
        <ChevronLeft className="size-4" /> Back
      </Link>

      {/* Hero / Meta */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-3">
            <div className="w-full h-44 rounded-xl bg-neutral-200" aria-hidden />
            <h1 className="text-3xl font-semibold">{course.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
              <span className="inline-flex items-center gap-1"><BookOpen className="size-4"/> {course.category}</span>
              <span>•</span>
              <span>Level: {course.level}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1"><Clock className="size-4"/>{totalMin} min</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1"><Users className="size-4"/>{course.stats.students} students</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1"><Star className="size-4"/>{course.stats.rating} ({course.stats.reviews})</span>
            </div>

            <p className="text-neutral-800">{course.description}</p>
          </div>
        </div>

        {/* Side CTA card */}
        <aside className="rounded-2xl border border-neutral-200 bg-white p-5 h-fit">
          <div className="w-full h-40 rounded-xl bg-neutral-300 mb-4" aria-hidden />
          <div className="space-y-2 mb-4">
            <div className="text-sm text-neutral-600">Author</div>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-neutral-300" aria-hidden />
              <div>
                <div className="font-medium">{course.author}</div>
                <div className="text-sm text-neutral-600">Teacher</div>
              </div>
            </div>
          </div>

          {!enrolled ? (
            <button
              onClick={() => setEnrolled(true)}
              className="w-full rounded-xl bg-black text-white px-4 py-2 font-semibold"
            >
              Enroll for free
            </button>
          ) : (
            <button
              onClick={() => window.alert('Continue from last lesson… (stub)')}
              className="w-full rounded-xl bg-neutral-200 px-4 py-2 font-semibold"
            >
              Continue
            </button>
          )}

          <button
            onClick={() => window.alert('Preview course trailer… (stub)')}
            className="mt-2 w-full rounded-xl border px-4 py-2 inline-flex items-center justify-center gap-2"
          >
            <Play className="size-4" /> Preview
          </button>
        </aside>
      </div>

      {/* Syllabus */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-xl font-semibold mb-3">Syllabus</h2>
        <ul className="divide-y">
          {course.lessons.map(lesson => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function LessonRow({ lesson }: { lesson: Lesson }) {
  return (
    <li className="py-3 flex items-center gap-3">
      <div className="grid place-items-center size-9 rounded-full bg-neutral-100 border">
        <Play className="size-4" />
      </div>
      <div className="mr-auto">
        <div className="font-medium">{lesson.title}</div>
        <div className="text-sm text-neutral-600 inline-flex items-center gap-2">
          <span>{lesson.durationMin} min</span>
          {lesson.isFreePreview && <span className="px-2 py-0.5 rounded-full border text-xs">Free preview</span>}
        </div>
      </div>
      <button className="rounded-lg border px-3 py-1.5 hover:bg-neutral-50">Start</button>
    </li>
  )
}
