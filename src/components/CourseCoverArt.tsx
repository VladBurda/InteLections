import { COURSE_TEMPLATES, normalizeCourseTemplate } from '../lib/courseTemplates'

function templateMeta(templateKey?: string, category?: string) {
  const key = normalizeCourseTemplate(templateKey, category)
  return COURSE_TEMPLATES.find(template => template.key === key) ?? COURSE_TEMPLATES[0]
}

type CourseCoverArtProps = {
  title: string
  category?: string
  thumbnailUrl?: string
  templateKey?: string
  className?: string
  showText?: boolean
}

function HistoryDecoration() {
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-10 bg-[linear-gradient(90deg,rgba(255,248,228,0.34),rgba(255,255,255,0.06),rgba(92,51,23,0.18))]" />
      <div className="absolute left-5 top-5 h-24 w-16 rounded-[20px] border border-white/20 bg-[linear-gradient(180deg,rgba(112,69,36,0.48),rgba(248,221,174,0.16))] shadow-[0_12px_30px_rgba(45,23,8,0.18)]" />
      <div className="absolute left-10 top-12 h-3 w-24 rounded-full bg-white/20" />
      <div className="absolute left-10 top-[4.9rem] h-3 w-16 rounded-full bg-white/12" />
      <div className="absolute right-6 top-6 h-16 w-16 rounded-full border border-white/24 bg-[radial-gradient(circle,rgba(255,240,200,0.78)_0%,rgba(255,240,200,0.16)_54%,transparent_58%)]" />
      <div className="absolute bottom-5 left-6 h-12 w-28 rounded-[18px] border border-white/16 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(123,73,37,0.24))]" />
      <div className="absolute bottom-9 left-10 h-2 w-16 rounded-full bg-white/20" />
      <div className="absolute bottom-6 right-8 h-24 w-24 rounded-[30px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,251,236,0.22),rgba(88,48,26,0.14))]" />
      <div className="absolute bottom-14 right-14 h-10 w-10 rounded-full border border-white/16 bg-white/16" />
    </>
  )
}

function MathematicsDecoration() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.14)_1px,transparent_1px)] bg-[size:34px_34px] opacity-45" />
      <div className="absolute left-6 top-6 h-20 w-20 rounded-[26px] border border-white/30 bg-white/12" />
      <div className="absolute left-14 top-16 h-1.5 w-24 rounded-full bg-white/70" />
      <div className="absolute left-20 top-10 h-20 w-1.5 rounded-full bg-white/55" />
      <div className="absolute right-7 top-8 h-24 w-32 rounded-[28px] border border-white/22 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.06))]" />
      <div className="absolute right-11 top-14 h-12 w-12 rounded-full border border-white/34 bg-white/16" />
      <div className="absolute right-24 top-16 h-1.5 w-16 rounded-full bg-white/60" />
      <div className="absolute bottom-7 left-8 h-16 w-36 rounded-[26px] border border-white/22 bg-[linear-gradient(135deg,rgba(15,23,42,0.16),rgba(255,255,255,0.18))]" />
      <div className="absolute bottom-14 left-14 h-1.5 w-20 rounded-full bg-white/70" />
      <div className="absolute bottom-[2.75rem] left-28 h-1.5 w-10 rounded-full bg-white/40" />
      <div className="absolute bottom-10 right-9 flex gap-3">
        <div className="h-4 w-4 rounded-full bg-white/70" />
        <div className="h-4 w-4 rounded-full bg-white/50" />
        <div className="h-4 w-4 rounded-full bg-white/34" />
      </div>
    </>
  )
}

function ProgrammingDecoration() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.22),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(20,184,166,0.18),transparent_32%)]" />
      <div className="absolute left-5 top-5 h-24 w-[138px] rounded-[22px] border border-cyan-200/18 bg-[#0f172acc] shadow-[0_12px_28px_rgba(8,15,28,0.35)]" />
      <div className="absolute left-9 top-9 flex gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-rose-300/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
      </div>
      <div className="absolute left-10 top-16 h-2 w-20 rounded-full bg-cyan-300/72" />
      <div className="absolute left-10 top-[5.5rem] h-2 w-16 rounded-full bg-teal-200/56" />
      <div className="absolute left-10 top-28 h-2 w-24 rounded-full bg-white/24" />
      <div className="absolute right-8 top-10 h-14 w-24 rounded-[18px] border border-cyan-200/14 bg-white/8" />
      <div className="absolute right-16 top-16 h-10 w-8 rounded-[10px] bg-cyan-300/75" />
      <div className="absolute bottom-7 right-24 h-20 w-28 rounded-[24px] border border-cyan-200/16 bg-[#111827b8]" />
      <div className="absolute bottom-16 right-[4.5rem] h-2 w-16 rounded-full bg-cyan-300/70" />
      <div className="absolute bottom-11 right-[4.5rem] h-2 w-10 rounded-full bg-emerald-300/46" />
      <div className="absolute bottom-8 left-8 h-9 w-24 rounded-full border border-cyan-200/20 bg-cyan-300/12" />
    </>
  )
}

function DefaultDecoration({ accentClassName }: { accentClassName: string }) {
  return (
    <>
      <div className={`absolute left-4 top-4 h-12 w-12 rounded-2xl ${accentClassName}`} />
      <div className={`absolute right-6 top-6 h-20 w-20 rounded-full ${accentClassName}`} />
      <div className={`absolute bottom-4 left-8 h-16 w-16 rounded-full ${accentClassName}`} />
      <div className={`absolute bottom-5 right-5 h-10 w-24 rounded-full ${accentClassName}`} />
    </>
  )
}

function TemplateDecoration({ templateKey, accentClassName }: { templateKey: string; accentClassName: string }) {
  if (templateKey === 'history') return <HistoryDecoration />
  if (templateKey === 'mathematics') return <MathematicsDecoration />
  if (templateKey === 'programming') return <ProgrammingDecoration />
  return <DefaultDecoration accentClassName={accentClassName} />
}

export default function CourseCoverArt({
  title,
  category = '',
  thumbnailUrl = '',
  templateKey,
  className = 'h-32 w-full rounded-2xl',
  showText = true,
}: CourseCoverArtProps) {
  if (thumbnailUrl) {
    return (
      <div className={`${className} overflow-hidden border border-black/5 bg-neutral-100`}>
        <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
      </div>
    )
  }

  const template = templateMeta(templateKey, category)
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(token => token[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className={`${className} relative overflow-hidden border border-black/5 ${template.className}`}>
      <TemplateDecoration templateKey={template.key} accentClassName={template.accentClassName} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.18))]" />
      {showText ? (
        <div className="relative flex h-full flex-col justify-between p-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-white/16 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/90">
              {category || template.label}
            </span>
            <span className="text-2xl font-semibold text-white/90">{initials || 'IL'}</span>
          </div>
          <div className="max-w-[80%]">
            <p className="line-clamp-2 text-lg font-semibold leading-tight text-white drop-shadow-sm">{title}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
