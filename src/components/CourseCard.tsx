import { Link } from 'react-router-dom'

export type Course = {
  id: string
  title: string
  author: string
  thumbnailUrl?: string
}

export default function CourseCard({ course }: { course: Course }) {
  return (
    <article className="relative rounded-2xl border border-neutral-200 bg-white shadow-sm min-h-[260px] p-4 flex flex-col gap-3">
      <button
        aria-label="Card menu"
        className="absolute right-3 top-3 size-7 grid place-items-center rounded-md hover:bg-neutral-100"
      >
        ⋯
      </button>
      <div className="w-full h-[clamp(90px,20vw,140px)] rounded-xl bg-neutral-300" aria-hidden />
      <h3 className="text-[clamp(16px,2.2vw,22px)] font-semibold m-0">{course.title}</h3>
      <div className="text-[clamp(14px,2vw,18px)] font-light text-neutral-600">{course.author}</div>
      <a className="mt-auto inline-flex items-center justify-center px-4 py-2 rounded-xl bg-neutral-200 text-[clamp(14px,2vw,18px)] font-semibold" href="#">
        <Link className="mt-auto inline-flex items-center justify-center px-4 py-2 rounded-xl bg-neutral-200 font-semibold" to="/course/ancient-civ">
          View Course
        </Link>
      </a>
    </article>
  )
}
