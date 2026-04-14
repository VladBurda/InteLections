export type CourseTemplateKey =
  | 'classic'
  | 'history'
  | 'mathematics'
  | 'science'
  | 'programming'
  | 'language'
  | 'art'

export const COURSE_TEMPLATES: Array<{
  key: CourseTemplateKey
  label: string
  hint: string
  className: string
  accentClassName: string
}> = [
  {
    key: 'classic',
    label: 'Classic',
    hint: 'Warm neutral cover for flexible topics.',
    className: 'bg-[linear-gradient(135deg,#f5f0e7_0%,#e6efe8_52%,#d7e3ef_100%)]',
    accentClassName: 'bg-black/10',
  },
  {
    key: 'history',
    label: 'History',
    hint: 'Sand, parchment and archive-inspired tones.',
    className: 'bg-[linear-gradient(135deg,#e6c98f_0%,#c48f5a_42%,#6f4e37_100%)]',
    accentClassName: 'bg-white/18',
  },
  {
    key: 'mathematics',
    label: 'Mathematics',
    hint: 'Crisp blue structure with analytical contrast.',
    className: 'bg-[linear-gradient(135deg,#d7ebff_0%,#7bb7ff_48%,#1f5eff_100%)]',
    accentClassName: 'bg-white/24',
  },
  {
    key: 'science',
    label: 'Science',
    hint: 'Fresh laboratory greens and cool light.',
    className: 'bg-[linear-gradient(135deg,#d7f7e2_0%,#7dd3a5_45%,#1d7f63_100%)]',
    accentClassName: 'bg-white/20',
  },
  {
    key: 'programming',
    label: 'Programming',
    hint: 'Dark editor-inspired palette with neon accent.',
    className: 'bg-[linear-gradient(135deg,#111827_0%,#1f2937_45%,#0f766e_100%)]',
    accentClassName: 'bg-cyan-300/20',
  },
  {
    key: 'language',
    label: 'Language',
    hint: 'Soft coral and paper tones for communication topics.',
    className: 'bg-[linear-gradient(135deg,#ffe8df_0%,#ffb48f_48%,#d45d47_100%)]',
    accentClassName: 'bg-white/22',
  },
  {
    key: 'art',
    label: 'Art',
    hint: 'Gallery-inspired color blend with bold contrast.',
    className: 'bg-[linear-gradient(135deg,#fff0b8_0%,#ff8a65_38%,#7c3aed_100%)]',
    accentClassName: 'bg-white/18',
  },
]

export function normalizeCourseTemplate(templateKey?: string, category?: string): CourseTemplateKey {
  const normalized = String(templateKey || '').trim().toLowerCase()
  if (COURSE_TEMPLATES.some(template => template.key === normalized)) {
    return normalized as CourseTemplateKey
  }

  const categoryValue = String(category || '').trim().toLowerCase()
  if (categoryValue.includes('history')) return 'history'
  if (categoryValue.includes('math')) return 'mathematics'
  if (categoryValue.includes('science')) return 'science'
  if (categoryValue.includes('program')) return 'programming'
  if (categoryValue.includes('language')) return 'language'
  if (categoryValue.includes('art')) return 'art'
  return 'classic'
}
