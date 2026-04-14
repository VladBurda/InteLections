import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { BookOpen, CheckSquare, ChevronLeft, Clock, FileText, FolderOpen, FolderPlus, GripVertical, Lock, Music4, Pencil, Plus, Sparkles, SquareArrowOutUpRight, Star, Trash2, Upload, Users, Video } from 'lucide-react'
import {
  createLesson,
  createLessonMaterialSection,
  createLessonQuiz,
  generateLessonQuizDraft,
  createCourseCheckout,
  enrollInCourse,
  getCourseDetails,
  publishCourse,
  setCoursePublishBlock,
  rateCourse,
  submitCourseReview,
  deleteCourseReview,
  removeLessonMaterial,
  removeLessonMaterialSection,
  saveLessonMaterialLayout,
  submitQuizAttempt,
  updateLesson,
  updateLessonMaterial,
  updateLessonMaterialSection,
  uploadLearnerCourseMaterial,
  uploadLessonMaterials,
  type CourseDetails,
  type CreateLessonQuizInput,
  type GeneratedLessonQuizDraft,
  type Lesson,
  type LessonMaterial,
  type LessonMaterialSection,
  type QuizAttemptSummary,
  type QuizQuestion,
} from '../lib/api'
import CourseCoverArt from '../components/CourseCoverArt'

type QuestionType = 'single-choice' | 'multi-select' | 'true-false' | 'open-answer'

type QuizDraftOption = {
  text: string
  isCorrect: boolean
}

type QuizDraftQuestion = {
  prompt: string
  questionType: QuestionType
  acceptedAnswer: string
  options: QuizDraftOption[]
}

type AttemptAnswer = {
  questionId: string
  answerText?: string
  selectedOptionIds?: string[]
}

type UploadedMaterialDraft = {
  file: File
  description: string
  sectionId: string | null
}

type YouTubeMaterialDraft = {
  title: string
  youtubeUrl: string
  description: string
  sectionId: string | null
}

type MaterialEditDraft = {
  id: string
  lessonId: string
  title: string
  description: string
  sectionId: string | null
  replacementFile: File | null
  materialKind: LessonMaterial['materialKind']
  youtubeUrl: string
}

type LessonEditDraft = {
  id: string
  title: string
  durationMin: string
  isFreePreview: boolean
}

type LearnerMaterialUploadDraft = {
  title: string
  description: string
  file: File | null
}

type SectionEditDraft = {
  id: string | null
  lessonId: string
  title: string
  description: string
  isPaidContent: boolean
}

type MaterialBucket = {
  id: string
  title: string
  description: string
  sectionId: string | null
  materials: LessonMaterial[]
}

const defaultOptions = (): QuizDraftOption[] => [
  { text: '', isCorrect: true },
  { text: '', isCorrect: false },
]

const trueFalseOptions = (correctValue = 'true'): QuizDraftOption[] => [
  { text: 'True', isCorrect: correctValue === 'true' },
  { text: 'False', isCorrect: correctValue === 'false' },
]

const createEmptyQuestion = (): QuizDraftQuestion => ({
  prompt: '',
  questionType: 'single-choice',
  acceptedAnswer: '',
  options: defaultOptions(),
})

function toDraftQuestion(question: QuizQuestion): QuizDraftQuestion {
  if (question.questionType === 'open-answer') {
    return {
      prompt: question.prompt,
      questionType: 'open-answer',
      acceptedAnswer: question.acceptedAnswer ?? '',
      options: [],
    }
  }

  if (question.questionType === 'true-false') {
    const correct = question.options.find(option => option.isCorrect)?.text.toLowerCase() === 'false' ? 'false' : 'true'
    return {
      prompt: question.prompt,
      questionType: 'true-false',
      acceptedAnswer: '',
      options: trueFalseOptions(correct),
    }
  }

  return {
    prompt: question.prompt,
    questionType: question.questionType,
    acceptedAnswer: '',
    options: question.options.map(option => ({ text: option.text, isCorrect: option.isCorrect })),
  }
}

function toDraftQuestionFromGenerated(question: GeneratedLessonQuizDraft['questions'][number]): QuizDraftQuestion {
  if (question.questionType === 'open-answer') {
    return {
      prompt: question.prompt,
      questionType: 'open-answer',
      acceptedAnswer: question.acceptedAnswer ?? '',
      options: [],
    }
  }

  if (question.questionType === 'true-false') {
    const correct = question.options.find(option => option.isCorrect)?.text.toLowerCase() === 'false' ? 'false' : 'true'
    return {
      prompt: question.prompt,
      questionType: 'true-false',
      acceptedAnswer: '',
      options: trueFalseOptions(correct),
    }
  }

  return {
    prompt: question.prompt,
    questionType: question.questionType,
    acceptedAnswer: '',
    options: question.options.map(option => ({ text: option.text, isCorrect: option.isCorrect })),
  }
}

function hasQuizDraftContent(state: {
  quizTitle: string
  quizDescription: string
  quizTimeLimit: string
  quizMaxAttempts: string
  quizQuestions: QuizDraftQuestion[]
}) {
  if (state.quizTitle.trim() || state.quizDescription.trim() || state.quizTimeLimit.trim() || state.quizMaxAttempts.trim()) {
    return true
  }

  return state.quizQuestions.some(question =>
    question.prompt.trim()
    || question.acceptedAnswer.trim()
    || question.options.some(option => option.text.trim()),
  )
}
function normalizeSectionId(sectionId: string | null | undefined) {
  const value = String(sectionId ?? '').trim()
  return value ? value : null
}

function sortMaterials(materials: LessonMaterial[]) {
  return [...materials].sort((a, b) => {
    const orderDelta = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
    if (orderDelta !== 0) return orderDelta
    return a.title.localeCompare(b.title)
  })
}

function sortSections(sections: LessonMaterialSection[]) {
  return [...sections].sort((a, b) => {
    const orderDelta = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)
    if (orderDelta !== 0) return orderDelta
    return a.title.localeCompare(b.title)
  })
}

function formatAttemptLimit(maxAttempts: number | null | undefined) {
  if (maxAttempts == null) return 'Unlimited tries'
  return `${maxAttempts} ${maxAttempts === 1 ? 'try' : 'tries'}`
}

function formatAttemptUsage(attemptsUsed: number | undefined, maxAttempts: number | null | undefined) {
  if (maxAttempts == null) {
    const used = Number(attemptsUsed ?? 0)
    return used > 0 ? `${used} ${used === 1 ? 'attempt' : 'attempts'} used` : 'Unlimited tries'
  }

  return `${Number(attemptsUsed ?? 0)} / ${maxAttempts} tries used`
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(totalSeconds, 0)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getTimerTone(remainingRatio: number) {
  if (remainingRatio <= 0.15) {
    return {
      shell: 'border-red-200 bg-red-50 text-red-700',
      bar: 'bg-red-500',
    }
  }

  if (remainingRatio <= 0.4) {
    return {
      shell: 'border-amber-200 bg-amber-50 text-amber-700',
      bar: 'bg-amber-500',
    }
  }

  return {
    shell: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
  }
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const timezoneOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function formatAvailabilityLabel(quiz: Lesson['quiz']) {
  if (!quiz) return ''

  if (quiz.availabilityStatus === 'closed' && quiz.availableTo) {
    return `Closed ${new Date(quiz.availableTo).toLocaleString()}`
  }

  if (quiz.availableFrom && quiz.availableTo) {
    return `Open ${new Date(quiz.availableFrom).toLocaleString()} - ${new Date(quiz.availableTo).toLocaleString()}`
  }

  if (quiz.availabilityStatus === 'scheduled' && quiz.availableFrom) {
    return `Opens ${new Date(quiz.availableFrom).toLocaleString()}`
  }

  if (quiz.availableTo) {
    return `Closes ${new Date(quiz.availableTo).toLocaleString()}`
  }

  if (quiz.accessScope === 'group' && quiz.accessGroupName) {
    return quiz.canAttempt ? `Open for ${quiz.accessGroupName}` : `Reserved for ${quiz.accessGroupName}`
  }

  return 'Available now'
}

function getQuizActionLabel(lesson: Lesson) {
  const quiz = lesson.quiz
  if (!quiz) return 'Solve test'
  if (quiz.maxAttempts != null && Number(quiz.attemptsUsed ?? 0) >= quiz.maxAttempts) {
    return 'No tries left'
  }
  if (quiz.canAttempt === false) {
    if (quiz.availabilityStatus === 'closed') return 'Closed'
    if (quiz.availabilityStatus === 'scheduled') return 'Not available yet'
    if (quiz.availabilityStatus === 'group-only') return 'Group only'
  }
  return 'Solve test'
}

function formatLevel(level: string) {
  return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Level not set'
}

function formatCoursePrice(priceCents: number | null | undefined, currency: string | null | undefined) {
  if (priceCents == null || !Number.isFinite(priceCents)) return null
  return ((priceCents / 100).toFixed(2)) + ' ' + (currency || 'PLN')
}

function formatSectionOptionLabel(section: LessonMaterialSection) {
  return section.isPaidContent ? `${section.title} (Paid contents)` : section.title
}

function inferMaterialKindFromFile(file: File) {
  const mimeType = String(file.type || '').toLowerCase()
  const name = file.name.toLowerCase()
  if (mimeType.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(name)) return 'video'
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/.test(name)) return 'audio'
  return 'document'
}

function readVideoDurationSeconds(file: File) {
  return new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = objectUrl
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0)
      URL.revokeObjectURL(objectUrl)
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('We could not read the video duration. Please try an MP4 or WebM file.'))
        return
      }
      resolve(duration)
    }
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('We could not read the video duration. Please try an MP4 or WebM file.'))
    }
  })
}

function formatVideoDurationLabel(totalSeconds: number | null | undefined) {
  if (!totalSeconds || totalSeconds <= 0) return null
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function autoScrollWhileDragging(event: DragEvent<HTMLElement>) {
  const edgeThreshold = 120
  const scrollStep = 18

  if (event.clientY < edgeThreshold) {
    window.scrollBy({ top: -scrollStep, behavior: 'auto' })
    return
  }

  if (window.innerHeight - event.clientY < edgeThreshold) {
    window.scrollBy({ top: scrollStep, behavior: 'auto' })
  }
}

function HeroMetaCard({ icon, label, value, revealed, delayMs = 0 }: { icon: ReactNode; label: string; value: string; revealed: boolean; delayMs?: number }) {
  return (
    <div
      className={[
        'rounded-[22px] border border-neutral-200 bg-white/88 px-4 py-3 shadow-sm backdrop-blur transition-all duration-500',
        revealed ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      ].join(' ')}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        <span className="text-neutral-400">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-base font-semibold text-neutral-900">{value}</p>
    </div>
  )
}

function getNameInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(token => token[0]?.toUpperCase() ?? '')
    .join('') || 'IL'
}

function getLessonBuckets(lesson: Lesson, includeLooseBucket = false): MaterialBucket[] {
  const orderedMaterials = sortMaterials(lesson.materials)
  const orderedSections = sortSections(lesson.materialSections)
  const looseMaterials = orderedMaterials.filter(material => !normalizeSectionId(material.sectionId))

  const buckets: MaterialBucket[] = []
  if (includeLooseBucket || looseMaterials.length > 0) {
    buckets.push({
      id: 'ungrouped',
      title: 'Loose materials',
      description: 'Materials that are still outside a lesson folder.',
      sectionId: null,
      materials: looseMaterials,
    })
  }

  for (const section of orderedSections) {
    buckets.push({
      id: section.id,
      title: section.title,
      description: section.description ?? '',
      sectionId: section.id,
      materials: orderedMaterials.filter(material => normalizeSectionId(material.sectionId) === section.id),
    })
  }

  return buckets
}

function buildMaterialLayout(
  lesson: Lesson,
  draggedMaterialId: string,
  targetSectionId: string | null,
  targetMaterialId?: string,
) {
  const orderedMaterials = sortMaterials(lesson.materials)
  const draggedMaterial = orderedMaterials.find(material => material.id === draggedMaterialId)
  if (!draggedMaterial) {
    return orderedMaterials.map(material => ({ id: material.id, sectionId: normalizeSectionId(material.sectionId) }))
  }

  const normalizedTargetSectionId = normalizeSectionId(targetSectionId)
  const remainingMaterials = orderedMaterials.filter(material => material.id !== draggedMaterialId)
  const displayWithoutDragged = getLessonBuckets({ ...lesson, materials: remainingMaterials }, true).flatMap(bucket => bucket.materials)

  let insertIndex = displayWithoutDragged.length
  if (targetMaterialId) {
    const indexBeforeTarget = displayWithoutDragged.findIndex(material => material.id === targetMaterialId)
    if (indexBeforeTarget >= 0) {
      insertIndex = indexBeforeTarget
    }
  } else {
    let lastIndexInBucket = -1
    for (let index = 0; index < displayWithoutDragged.length; index += 1) {
      if (normalizeSectionId(displayWithoutDragged[index].sectionId) === normalizedTargetSectionId) {
        lastIndexInBucket = index
      }
    }

    if (lastIndexInBucket >= 0) {
      insertIndex = lastIndexInBucket + 1
    } else {
      const bucketOrder = [null, ...sortSections(lesson.materialSections).map(section => section.id)]
      const currentBucketIndex = bucketOrder.findIndex(sectionId => sectionId === normalizedTargetSectionId)

      for (let index = currentBucketIndex + 1; index < bucketOrder.length; index += 1) {
        const nextBucketId = bucketOrder[index]
        const firstMaterialInNextBucket = displayWithoutDragged.findIndex(material => normalizeSectionId(material.sectionId) === nextBucketId)
        if (firstMaterialInNextBucket >= 0) {
          insertIndex = firstMaterialInNextBucket
          break
        }
      }
    }
  }

  const movedMaterial: LessonMaterial = { ...draggedMaterial, sectionId: normalizedTargetSectionId }
  const nextDisplay = [
    ...displayWithoutDragged.slice(0, insertIndex),
    movedMaterial,
    ...displayWithoutDragged.slice(insertIndex),
  ]

  return nextDisplay.map(material => ({
    id: material.id,
    sectionId: normalizeSectionId(material.sectionId),
  }))
}

export default function CourseDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [course, setCourse] = useState<CourseDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const [showAddLesson, setShowAddLesson] = useState(false)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonDuration, setLessonDuration] = useState('10')
  const [lessonPreview, setLessonPreview] = useState(false)
  const [savingLesson, setSavingLesson] = useState(false)
  const [formError, setFormError] = useState('')
  const [activeLessonEditor, setActiveLessonEditor] = useState<LessonEditDraft | null>(null)
  const [savingLessonEdit, setSavingLessonEdit] = useState(false)
  const [lessonEditError, setLessonEditError] = useState('')
  const [learnerMaterialDraft, setLearnerMaterialDraft] = useState<LearnerMaterialUploadDraft>({ title: '', description: '', file: null })
  const [savingLearnerMaterial, setSavingLearnerMaterial] = useState(false)
  const [learnerMaterialError, setLearnerMaterialError] = useState('')

  const [activeMaterialsLessonId, setActiveMaterialsLessonId] = useState<string | null>(null)
  const [materialDrafts, setMaterialDrafts] = useState<UploadedMaterialDraft[]>([])
  const [youtubeDraft, setYoutubeDraft] = useState<YouTubeMaterialDraft>({ title: '', youtubeUrl: '', description: '', sectionId: null })
  const [materialsError, setMaterialsError] = useState('')
  const [savingMaterials, setSavingMaterials] = useState(false)
  const [activeMaterialEditor, setActiveMaterialEditor] = useState<MaterialEditDraft | null>(null)
  const [savingMaterialEdit, setSavingMaterialEdit] = useState(false)
  const [materialEditError, setMaterialEditError] = useState('')
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null)
  const [activeSectionEditor, setActiveSectionEditor] = useState<SectionEditDraft | null>(null)
  const [savingSection, setSavingSection] = useState(false)
  const [sectionError, setSectionError] = useState('')
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)
  const [savingLayoutLessonId, setSavingLayoutLessonId] = useState<string | null>(null)
  const [draggedMaterialId, setDraggedMaterialId] = useState<string | null>(null)
  const [dragTargetKey, setDragTargetKey] = useState<string | null>(null)

  const [activeQuizLessonId, setActiveQuizLessonId] = useState<string | null>(null)
  const [quizTitle, setQuizTitle] = useState('')
  const [quizDescription, setQuizDescription] = useState('')
  const [quizPassingScore, setQuizPassingScore] = useState('60')
  const [quizTimeLimit, setQuizTimeLimit] = useState('')
  const [quizMaxAttempts, setQuizMaxAttempts] = useState('')
  const [quizAccessScope, setQuizAccessScope] = useState<'course' | 'group'>('course')
  const [quizAccessGroupId, setQuizAccessGroupId] = useState('')
  const [quizAvailableFrom, setQuizAvailableFrom] = useState('')
  const [quizAvailableTo, setQuizAvailableTo] = useState('')
  const [quizQuestions, setQuizQuestions] = useState<QuizDraftQuestion[]>([createEmptyQuestion()])
  const [quizError, setQuizError] = useState('')
  const [savingQuiz, setSavingQuiz] = useState(false)
  const [showAiQuizPanel, setShowAiQuizPanel] = useState(false)
  const [generatingQuiz, setGeneratingQuiz] = useState(false)
  const [aiQuestionCount, setAiQuestionCount] = useState('5')
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'mixed' | 'challenging'>('mixed')
  const [aiPreferredQuestionTypes, setAiPreferredQuestionTypes] = useState<QuestionType[]>(['single-choice', 'multi-select'])
  const [aiTeacherInstruction, setAiTeacherInstruction] = useState('')

  const [publishingCourse, setPublishingCourse] = useState(false)
  const [publishingError, setPublishingError] = useState('')
  const [enrollingCourse, setEnrollingCourse] = useState(false)
  const [buyingCourseAccess, setBuyingCourseAccess] = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [ratingCourse, setRatingCourse] = useState(false)
  const [ratingError, setRatingError] = useState('')
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const [deletingReview, setDeletingReview] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [adminPublishBlocked, setAdminPublishBlocked] = useState(false)
  const [adminPublishBlockMessage, setAdminPublishBlockMessage] = useState('')
  const [savingPublishModeration, setSavingPublishModeration] = useState(false)
  const [publishModerationError, setPublishModerationError] = useState('')

  const [activeAttemptLesson, setActiveAttemptLesson] = useState<Lesson | null>(null)
  const [attemptAnswers, setAttemptAnswers] = useState<Record<string, AttemptAnswer>>({})
  const [attemptError, setAttemptError] = useState('')
  const [submittingAttempt, setSubmittingAttempt] = useState(false)
  const [attemptResult, setAttemptResult] = useState<QuizAttemptSummary | null>(null)
  const [attemptTimeLeftSec, setAttemptTimeLeftSec] = useState<number | null>(null)
  const [attemptAutoSubmitted, setAttemptAutoSubmitted] = useState(false)
  const [heroReady, setHeroReady] = useState(false)

  const loadCourse = useCallback(async (courseId: string) => {
    setLoading(true)
    try {
      const payload = await getCourseDetails(courseId)
      setCourse(payload)
    } catch {
      navigate('/discover', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    if (!id) {
      navigate('/discover', { replace: true })
      return
    }

    void loadCourse(id)
  }, [id, navigate, loadCourse])

  useEffect(() => {
    setHeroReady(false)
    const frame = window.requestAnimationFrame(() => setHeroReady(true))
    return () => window.cancelAnimationFrame(frame)
  }, [course?.id])

  useEffect(() => {
    setReviewTitle(course?.viewerReview?.title || '')
    setReviewText(course?.viewerReview?.text || '')
    setReviewError('')
  }, [course?.id, course?.viewerReview?.title, course?.viewerReview?.text])

  useEffect(() => {
    setAdminPublishBlocked(Boolean(course?.publishBlocked))
    setAdminPublishBlockMessage(course?.publishBlockMessage || '')
    setPublishModerationError('')
  }, [course?.id, course?.publishBlocked, course?.publishBlockMessage])

  const totalMin = useMemo(
    () => (course ? course.lessons.reduce((sum, lesson) => sum + lesson.durationMin, 0) : 0),
    [course],
  )

  const averageRatingLabel = useMemo(
    () => (course ? course.stats.rating.toFixed(1) : '0.0'),
    [course],
  )

  const reviewsLabel = useMemo(() => {
    if (!course) return '0 reviews'
    return `${course.stats.reviews} ${course.stats.reviews === 1 ? 'review' : 'reviews'}`
  }, [course])

  const hostedVideoLimitMinutes = course?.viewerSubscriptionPlan === 'plus' ? 30 : 5

  const hasWrittenReview = Boolean(course?.viewerReview)

  const activeMaterialsLesson = useMemo(
    () => course?.lessons.find(lesson => lesson.id === activeMaterialsLessonId) ?? null,
    [course, activeMaterialsLessonId],
  )

  const activeMaterialLesson = useMemo(
    () => course?.lessons.find(lesson => lesson.id === activeMaterialEditor?.lessonId) ?? null,
    [course, activeMaterialEditor],
  )

  useEffect(() => {
    if (!activeAttemptLesson?.quiz || attemptTimeLeftSec == null || attemptResult || submittingAttempt) return
    if (attemptTimeLeftSec <= 0 || attemptAutoSubmitted) return

    const timer = window.setTimeout(() => {
      setAttemptTimeLeftSec(current => (current == null ? current : Math.max(current - 1, 0)))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [activeAttemptLesson, attemptAutoSubmitted, attemptResult, attemptTimeLeftSec, submittingAttempt])

  function clearDragState() {
    setDraggedMaterialId(null)
    setDragTargetKey(null)
  }

  function closeQuizBuilderModal() {
    setActiveQuizLessonId(null)
    setQuizTitle('')
    setQuizDescription('')
    setQuizPassingScore('60')
    setQuizTimeLimit('')
    setQuizMaxAttempts('')
    setQuizAccessScope('course')
    setQuizAccessGroupId('')
    setQuizAvailableFrom('')
    setQuizAvailableTo('')
    setQuizQuestions([createEmptyQuestion()])
    setQuizError('')
    setShowAiQuizPanel(false)
    setGeneratingQuiz(false)
    setAiQuestionCount('5')
    setAiDifficulty('mixed')
    setAiPreferredQuestionTypes(['single-choice', 'multi-select'])
    setAiTeacherInstruction('')
  }

  function openQuizBuilderModal(lesson: Lesson) {
    setActiveQuizLessonId(lesson.id)
    setQuizError('')
    setShowAiQuizPanel(false)
    setGeneratingQuiz(false)
    setAiQuestionCount('5')
    setAiDifficulty('mixed')
    setAiPreferredQuestionTypes(['single-choice', 'multi-select'])
    setAiTeacherInstruction('')

    if (lesson.quiz) {
      setQuizTitle(lesson.quiz.title)
      setQuizDescription(lesson.quiz.description)
      setQuizPassingScore(String(lesson.quiz.passingScore))
      setQuizTimeLimit(lesson.quiz.timeLimitMin == null ? '' : String(lesson.quiz.timeLimitMin))
      setQuizMaxAttempts(lesson.quiz.maxAttempts == null ? '' : String(lesson.quiz.maxAttempts))
      setQuizAccessScope(lesson.quiz.accessScope === 'group' ? 'group' : 'course')
      setQuizAccessGroupId(lesson.quiz.accessGroupId ?? '')
      setQuizAvailableFrom(toDateTimeLocalValue(lesson.quiz.availableFrom))
      setQuizAvailableTo(toDateTimeLocalValue(lesson.quiz.availableTo))
      setQuizQuestions(lesson.quiz.questions.length > 0 ? lesson.quiz.questions.map(toDraftQuestion) : [createEmptyQuestion()])
      return
    }

    setQuizTitle('')
    setQuizDescription('')
    setQuizPassingScore('60')
    setQuizTimeLimit('')
    setQuizMaxAttempts('')
    setQuizAccessScope('course')
    setQuizAccessGroupId('')
    setQuizAvailableFrom('')
    setQuizAvailableTo('')
    setQuizQuestions([createEmptyQuestion()])
  }

  function applyGeneratedQuizDraft(draft: GeneratedLessonQuizDraft) {
    setQuizTitle(draft.title)
    setQuizDescription(draft.description ?? '')
    setQuizPassingScore(String(draft.passingScore))
    setQuizTimeLimit(draft.timeLimitMin == null ? '' : String(draft.timeLimitMin))
    setQuizMaxAttempts(draft.maxAttempts == null ? '' : String(draft.maxAttempts))
    setQuizQuestions(draft.questions.length > 0 ? draft.questions.map(toDraftQuestionFromGenerated) : [createEmptyQuestion()])
  }

  function toggleAiPreferredQuestionType(questionType: QuestionType) {
    setAiPreferredQuestionTypes(current =>
      current.includes(questionType)
        ? current.filter(item => item !== questionType)
        : [...current, questionType],
    )
  }

  async function onGenerateQuizWithAi() {
    if (!activeQuizLessonId || !course?.isOwner) return

    const shouldReplace = hasQuizDraftContent({
      quizTitle,
      quizDescription,
      quizTimeLimit,
      quizMaxAttempts,
      quizQuestions,
    })

    if (shouldReplace && !window.confirm('Replace the current quiz draft with a newly generated AI version?')) {
      return
    }

    setQuizError('')
    setGeneratingQuiz(true)
    try {
      const { draft } = await generateLessonQuizDraft(activeQuizLessonId, {
        questionCount: Number(aiQuestionCount),
        difficulty: aiDifficulty,
        preferredQuestionTypes: aiPreferredQuestionTypes,
        teacherInstruction: aiTeacherInstruction.trim(),
      })
      applyGeneratedQuizDraft(draft)
      setShowAiQuizPanel(false)
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Could not generate quiz draft')
    } finally {
      setGeneratingQuiz(false)
    }
  }
  function openAttemptModal(lesson: Lesson) {
    if (!lesson.quiz) return

    const initialAnswers = Object.fromEntries(lesson.quiz.questions.map(question => [question.id, {
      questionId: question.id,
      answerText: '',
      selectedOptionIds: [],
    }]))

    setActiveAttemptLesson(lesson)
    setAttemptAnswers(initialAnswers)
    setAttemptError('')
    setAttemptResult(null)
    setAttemptAutoSubmitted(false)
    setAttemptTimeLeftSec(lesson.quiz.timeLimitMin != null ? lesson.quiz.timeLimitMin * 60 : null)
  }

  function closeAttemptModal() {
    setActiveAttemptLesson(null)
    setAttemptAnswers({})
    setAttemptError('')
    setAttemptResult(null)
    setAttemptTimeLeftSec(null)
    setAttemptAutoSubmitted(false)
  }

  function openLessonEditor(lesson: Lesson) {
    setActiveLessonEditor({
      id: lesson.id,
      title: lesson.title,
      durationMin: String(lesson.durationMin),
      isFreePreview: Boolean(lesson.isFreePreview),
    })
    setLessonEditError('')
  }

  function closeLessonEditor() {
    setActiveLessonEditor(null)
    setLessonEditError('')
  }

  function openMaterialsModal(lesson: Lesson) {
    setActiveMaterialsLessonId(lesson.id)
    setMaterialDrafts([])
    setYoutubeDraft({ title: '', youtubeUrl: '', description: '', sectionId: null })
    setMaterialsError('')
  }

  function closeMaterialsModal() {
    setActiveMaterialsLessonId(null)
    setMaterialDrafts([])
    setYoutubeDraft({ title: '', youtubeUrl: '', description: '', sectionId: null })
    setMaterialsError('')
  }

  function openMaterialEditor(material: LessonMaterial, lessonId: string) {
    setActiveMaterialEditor({
      id: material.id,
      lessonId,
      title: material.title,
      description: material.description ?? '',
      sectionId: normalizeSectionId(material.sectionId),
      replacementFile: null,
      materialKind: material.materialKind,
      youtubeUrl: material.externalUrl ?? '',
    })
    setMaterialEditError('')
  }

  function closeMaterialEditor() {
    setActiveMaterialEditor(null)
    setMaterialEditError('')
  }

  function openSectionEditor(lesson: Lesson, section?: LessonMaterialSection) {
    setActiveSectionEditor({
      id: section?.id ?? null,
      lessonId: lesson.id,
      title: section?.title ?? '',
      description: section?.description ?? '',
      isPaidContent: Boolean(section?.isPaidContent),
    })
    setSectionError('')
  }

  function closeSectionEditor() {
    setActiveSectionEditor(null)
    setSectionError('')
  }

  async function onAddLessonSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!id) return

    setFormError('')
    const title = lessonTitle.trim()
    const duration = Number(lessonDuration)

    if (!title) {
      setFormError('Lesson title is required.')
      return
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      setFormError('Duration must be a positive number.')
      return
    }

    setSavingLesson(true)
    try {
      await createLesson(id, { title, durationMin: duration, isFreePreview: lessonPreview })
      setShowAddLesson(false)
      setLessonTitle('')
      setLessonDuration('10')
      setLessonPreview(false)
      await loadCourse(id)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create lesson')
    } finally {
      setSavingLesson(false)
    }
  }

  async function onSaveLessonEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeLessonEditor || !id) return

    const title = activeLessonEditor.title.trim()
    const duration = Number(activeLessonEditor.durationMin)

    if (!title) {
      setLessonEditError('Lesson title is required.')
      return
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      setLessonEditError('Duration must be a positive number.')
      return
    }

    setSavingLessonEdit(true)
    setLessonEditError('')
    try {
      await updateLesson(activeLessonEditor.id, {
        title,
        durationMin: duration,
        isFreePreview: activeLessonEditor.isFreePreview,
      })
      closeLessonEditor()
      await loadCourse(id)
    } catch (error) {
      setLessonEditError(error instanceof Error ? error.message : 'Could not update lesson')
    } finally {
      setSavingLessonEdit(false)
    }
  }

  async function onAddMaterialsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeMaterialsLessonId || !id) return

    setMaterialsError('')
    const hasFiles = materialDrafts.length > 0
    const hasYouTube = youtubeDraft.youtubeUrl.trim().length > 0

    if (!hasFiles && !hasYouTube) {
      setMaterialsError('Choose at least one file or paste a YouTube link.')
      return
    }

    const uploads: Array<
      | { file: File; description?: string; sectionId?: string | null; videoDurationSeconds?: number | null }
      | { youtubeUrl: string; title?: string; description?: string; sectionId?: string | null }
    > = []

    for (const draft of materialDrafts) {
      const itemKind = inferMaterialKindFromFile(draft.file)
      let videoDurationSeconds: number | null = null

      if (itemKind === 'video') {
        try {
          videoDurationSeconds = Math.round(await readVideoDurationSeconds(draft.file))
        } catch (error) {
          setMaterialsError(error instanceof Error ? error.message : 'Could not read video duration')
          return
        }

        if (videoDurationSeconds > hostedVideoLimitMinutes * 60) {
          setMaterialsError(`Hosted lesson videos must be ${hostedVideoLimitMinutes} minutes or shorter for your current plan.`)
          return
        }
      }

      uploads.push({
        file: draft.file,
        description: draft.description,
        sectionId: draft.sectionId,
        videoDurationSeconds,
      })
    }

    if (hasYouTube) {
      uploads.push({
        youtubeUrl: youtubeDraft.youtubeUrl.trim(),
        title: youtubeDraft.title.trim(),
        description: youtubeDraft.description.trim(),
        sectionId: youtubeDraft.sectionId,
      })
    }

    setSavingMaterials(true)
    try {
      await uploadLessonMaterials(activeMaterialsLessonId, uploads)
      closeMaterialsModal()
      await loadCourse(id)
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : 'Could not upload materials')
    } finally {
      setSavingMaterials(false)
    }
  }

  async function onSaveMaterialEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeMaterialEditor || !id) return

    const title = activeMaterialEditor.title.trim()
    if (!title) {
      setMaterialEditError('Material title is required.')
      return
    }

    setSavingMaterialEdit(true)
    setMaterialEditError('')
    try {
      if (activeMaterialEditor.materialKind === 'youtube' && !activeMaterialEditor.youtubeUrl.trim()) {
        setMaterialEditError('Paste a valid YouTube link for this material.')
        setSavingMaterialEdit(false)
        return
      }

      let replacementFileVideoDurationSeconds: number | null = null
      if (activeMaterialEditor.replacementFile && inferMaterialKindFromFile(activeMaterialEditor.replacementFile) === 'video') {
        replacementFileVideoDurationSeconds = Math.round(await readVideoDurationSeconds(activeMaterialEditor.replacementFile))
        if (replacementFileVideoDurationSeconds > hostedVideoLimitMinutes * 60) {
          setMaterialEditError(`Hosted lesson videos must be ${hostedVideoLimitMinutes} minutes or shorter for your current plan.`)
          setSavingMaterialEdit(false)
          return
        }
      }

      await updateLessonMaterial(activeMaterialEditor.id, {
        title,
        description: activeMaterialEditor.description.trim(),
        sectionId: activeMaterialEditor.sectionId,
        replacementFile: activeMaterialEditor.replacementFile,
        replacementFileVideoDurationSeconds,
        youtubeUrl: activeMaterialEditor.materialKind === 'youtube' ? activeMaterialEditor.youtubeUrl.trim() : undefined,
      })
      closeMaterialEditor()
      await loadCourse(id)
    } catch (error) {
      setMaterialEditError(error instanceof Error ? error.message : 'Could not update material')
    } finally {
      setSavingMaterialEdit(false)
    }
  }

  async function onUploadLearnerMaterial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!course || !id) return

    if (!learnerMaterialDraft.file) {
      setLearnerMaterialError('Choose a file to upload.')
      return
    }

    setSavingLearnerMaterial(true)
    setLearnerMaterialError('')
    try {
      await uploadLearnerCourseMaterial(id, {
        file: learnerMaterialDraft.file,
        title: learnerMaterialDraft.title.trim(),
        description: learnerMaterialDraft.description.trim(),
      })
      setLearnerMaterialDraft({ title: '', description: '', file: null })
      await loadCourse(id)
    } catch (error) {
      setLearnerMaterialError(error instanceof Error ? error.message : 'Could not upload learner material')
    } finally {
      setSavingLearnerMaterial(false)
    }
  }

  async function onSaveSectionSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeSectionEditor || !id) return

    const title = activeSectionEditor.title.trim()
    if (!title) {
      setSectionError('Folder title is required.')
      return
    }

    setSavingSection(true)
    setSectionError('')
    try {
      if (activeSectionEditor.id) {
        await updateLessonMaterialSection(activeSectionEditor.id, {
          title,
          description: activeSectionEditor.description.trim(),
          isPaidContent: activeSectionEditor.isPaidContent,
        })
      } else {
        await createLessonMaterialSection(activeSectionEditor.lessonId, {
          title,
          description: activeSectionEditor.description.trim(),
          isPaidContent: activeSectionEditor.isPaidContent,
        })
      }
      closeSectionEditor()
      await loadCourse(id)
    } catch (error) {
      setSectionError(error instanceof Error ? error.message : 'Could not save folder')
    } finally {
      setSavingSection(false)
    }
  }

  async function onDeleteMaterial(material: LessonMaterial) {
    if (!id) return

    const firstCheck = window.confirm('Delete material "' + material.title + '"?')
    if (!firstCheck) return

    const secondCheck = window.confirm('This removes the file from the lesson and deletes the stored file. Confirm again to continue.')
    if (!secondCheck) return

    setDeletingMaterialId(material.id)
    setMaterialsError('')
    try {
      await removeLessonMaterial(material.id)
      if (activeMaterialEditor?.id === material.id) {
        closeMaterialEditor()
      }
      await loadCourse(id)
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : 'Could not delete material')
    } finally {
      setDeletingMaterialId(null)
    }
  }

  async function onDeleteSection(section: LessonMaterialSection) {
    if (!id) return

    const firstCheck = window.confirm('Delete folder "' + section.title + '"?')
    if (!firstCheck) return

    const secondCheck = window.confirm('Materials inside this folder will stay in the lesson and become loose materials. Confirm again to continue.')
    if (!secondCheck) return

    setDeletingSectionId(section.id)
    setMaterialsError('')
    try {
      await removeLessonMaterialSection(section.id)
      if (activeSectionEditor?.id === section.id) {
        closeSectionEditor()
      }
      await loadCourse(id)
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : 'Could not delete folder')
    } finally {
      setDeletingSectionId(null)
    }
  }

  async function onSaveMaterialDrop(lesson: Lesson, targetSectionId: string | null, targetMaterialId?: string) {
    if (!id || !draggedMaterialId) return

    const nextLayout = buildMaterialLayout(lesson, draggedMaterialId, targetSectionId, targetMaterialId)
    setSavingLayoutLessonId(lesson.id)
    setMaterialsError('')
    try {
      await saveLessonMaterialLayout(lesson.id, nextLayout)
      await loadCourse(id)
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : 'Could not save material order')
    } finally {
      setSavingLayoutLessonId(null)
      clearDragState()
    }
  }

  async function onSavePublishModeration() {
    if (!course) return

    setSavingPublishModeration(true)
    setPublishModerationError('')
    try {
      const result = await setCoursePublishBlock(course.id, {
        blocked: adminPublishBlocked,
        message: adminPublishBlockMessage.trim(),
      })
      setCourse(current => current ? {
        ...current,
        publishBlocked: result.blocked,
        publishBlockMessage: result.message,
        publishStatus: result.publishStatus as CourseDetails['publishStatus'],
        isPublished: result.publishStatus === 'published',
      } : current)
      setAdminPublishBlocked(result.blocked)
      setAdminPublishBlockMessage(result.message)
    } catch (error) {
      setPublishModerationError(error instanceof Error ? error.message : 'Could not update publishing moderation')
    } finally {
      setSavingPublishModeration(false)
    }
  }

  async function onPublishCourse() {
    if (!course) return
    setPublishingError('')
    setPublishingCourse(true)
    try {
      await publishCourse(course.id)
      await loadCourse(course.id)
    } catch (error) {
      setPublishingError(error instanceof Error ? error.message : 'Could not publish course')
    } finally {
      setPublishingCourse(false)
    }
  }

  async function onSubmitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!course || !course.canRate) return

    setReviewError('')
    setSavingReview(true)
    try {
      const result = await submitCourseReview(course.id, {
        stars: course.viewerRating ?? null,
        title: reviewTitle,
        text: reviewText,
      })
      setCourse(current => current ? {
        ...current,
        viewerRating: result.viewerRating,
        viewerReview: Object.prototype.hasOwnProperty.call(result, 'viewerReview') ? (result.viewerReview ?? null) : current.viewerReview,
        courseReviews: result.courseReviews ?? current.courseReviews,
        stats: {
          ...current.stats,
          rating: result.rating,
          reviews: result.reviews,
        },
      } : current)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Could not save your review')
    } finally {
      setSavingReview(false)
    }
  }

  async function onDeleteReview() {
    if (!course || !course.canRate || !hasWrittenReview) return
    if (!window.confirm('Delete your written review? Your star rating will stay saved.')) return

    setReviewError('')
    setDeletingReview(true)
    try {
      const result = await deleteCourseReview(course.id)
      setReviewTitle('')
      setReviewText('')
      setCourse(current => current ? {
        ...current,
        viewerRating: result.viewerRating ?? current.viewerRating,
        viewerReview: Object.prototype.hasOwnProperty.call(result, 'viewerReview') ? (result.viewerReview ?? null) : current.viewerReview,
        courseReviews: result.courseReviews ?? current.courseReviews,
        stats: {
          ...current.stats,
          rating: result.rating,
          reviews: result.reviews,
        },
      } : current)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Could not delete your review')
    } finally {
      setDeletingReview(false)
    }
  }

  async function onEnrollCourse() {
    if (!course) return
    setEnrollError('')
    setEnrollingCourse(true)
    try {
      await enrollInCourse(course.id)
      await loadCourse(course.id)
    } catch (error) {
      setEnrollError(error instanceof Error ? error.message : 'Could not enroll in course')
    } finally {
      setEnrollingCourse(false)
    }
  }

  async function onBuyCourseAccess() {
    if (!course) return
    setEnrollError('')
    setBuyingCourseAccess(true)
    try {
      const payload = await createCourseCheckout(course.id)
      if (payload.url) {
        window.location.assign(payload.url)
        return
      }
      await loadCourse(course.id)
    } catch (error) {
      setEnrollError(error instanceof Error ? error.message : 'Could not open course checkout')
    } finally {
      setBuyingCourseAccess(false)
    }
  }

  async function onRateCourse(stars: number) {
    if (!course || !course.canRate) return

    setRatingError('')
    setRatingCourse(true)
    try {
      const result = await rateCourse(course.id, stars)
      setCourse(current => current ? {
        ...current,
        viewerRating: result.viewerRating,
        viewerReview: Object.prototype.hasOwnProperty.call(result, 'viewerReview') ? (result.viewerReview ?? null) : current.viewerReview,
        courseReviews: result.courseReviews ?? current.courseReviews,
        stats: {
          ...current.stats,
          rating: result.rating,
          reviews: result.reviews,
        },
      } : current)
    } catch (error) {
      setRatingError(error instanceof Error ? error.message : 'Could not save your rating')
    } finally {
      setRatingCourse(false)
    }
  }
  function updateQuestionPrompt(questionIndex: number, value: string) {
    setQuizQuestions(current => current.map((question, index) => (
      index === questionIndex ? { ...question, prompt: value } : question
    )))
  }

  function updateQuestionType(questionIndex: number, questionType: QuestionType) {
    setQuizQuestions(current => current.map((question, index) => {
      if (index !== questionIndex) return question
      if (questionType === 'open-answer') {
        return { ...question, questionType, acceptedAnswer: question.acceptedAnswer, options: [] }
      }
      if (questionType === 'true-false') {
        const currentCorrect = question.options.find(option => option.isCorrect)?.text.toLowerCase() === 'false' ? 'false' : 'true'
        return { ...question, questionType, acceptedAnswer: '', options: trueFalseOptions(currentCorrect) }
      }
      return {
        ...question,
        questionType,
        acceptedAnswer: '',
        options: question.options.length >= 2 ? question.options : defaultOptions(),
      }
    }))
  }

  function updateOpenAnswer(questionIndex: number, value: string) {
    setQuizQuestions(current => current.map((question, index) => (
      index === questionIndex ? { ...question, acceptedAnswer: value } : question
    )))
  }

  function updateOption(questionIndex: number, optionIndex: number, patch: Partial<QuizDraftOption>) {
    setQuizQuestions(current => current.map((question, qIndex) => {
      if (qIndex !== questionIndex) return question

      const nextOptions = question.options.map((option, oIndex) => {
        if (oIndex !== optionIndex) return option
        return { ...option, ...patch }
      })

      if (question.questionType === 'single-choice' && patch.isCorrect) {
        return {
          ...question,
          options: nextOptions.map((option, oIndex) => ({ ...option, isCorrect: oIndex === optionIndex })),
        }
      }

      return { ...question, options: nextOptions }
    }))
  }

  function addQuestion() {
    setQuizQuestions(current => [...current, createEmptyQuestion()])
  }

  function removeQuestion(questionIndex: number) {
    setQuizQuestions(current => current.length === 1 ? current : current.filter((_, index) => index !== questionIndex))
  }

  function addOption(questionIndex: number) {
    setQuizQuestions(current => current.map((question, index) => {
      if (index !== questionIndex || question.questionType === 'true-false' || question.questionType === 'open-answer') {
        return question
      }
      return { ...question, options: [...question.options, { text: '', isCorrect: false }] }
    }))
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    setQuizQuestions(current => current.map((question, index) => {
      if (index !== questionIndex || question.questionType === 'true-false' || question.questionType === 'open-answer') {
        return question
      }
      if (question.options.length <= 2) return question
      return { ...question, options: question.options.filter((_, innerIndex) => innerIndex !== optionIndex) }
    }))
  }

  function setChoiceAnswer(questionId: string, optionId: string, allowMultiple: boolean) {
    setAttemptAnswers(current => {
      const previous = current[questionId] ?? { questionId, answerText: '', selectedOptionIds: [] }
      const selected = new Set(previous.selectedOptionIds ?? [])

      if (allowMultiple) {
        if (selected.has(optionId)) selected.delete(optionId)
        else selected.add(optionId)
      } else {
        selected.clear()
        selected.add(optionId)
      }

      return {
        ...current,
        [questionId]: {
          questionId,
          answerText: '',
          selectedOptionIds: Array.from(selected),
        },
      }
    })
  }

  function setTextAnswer(questionId: string, value: string) {
    setAttemptAnswers(current => ({
      ...current,
      [questionId]: {
        questionId,
        answerText: value,
        selectedOptionIds: [],
      },
    }))
  }

  const handleAttemptSubmission = useCallback(async (skipCompletenessCheck = false) => {
    if (!activeAttemptLesson?.quiz || !id) return

    setAttemptError('')
    const answers = activeAttemptLesson.quiz.questions.map(question => {
      const current = attemptAnswers[question.id] ?? { questionId: question.id, answerText: '', selectedOptionIds: [] }
      return {
        questionId: question.id,
        answerText: current.answerText ?? '',
        selectedOptionIds: current.selectedOptionIds ?? [],
      }
    })

    if (!skipCompletenessCheck) {
      for (const question of activeAttemptLesson.quiz.questions) {
        const current = attemptAnswers[question.id]
        if (question.questionType === 'open-answer') {
          if (!current?.answerText?.trim()) {
            setAttemptError('Answer every open question before submitting.')
            return
          }
        } else if (!current?.selectedOptionIds?.length) {
          setAttemptError('Select an answer for each closed question before submitting.')
          return
        }
      }
    }

    setSubmittingAttempt(true)
    try {
      const payload = await submitQuizAttempt(activeAttemptLesson.quiz.id, { answers })
      setAttemptResult(payload.attempt)
      await loadCourse(id)
    } catch (error) {
      setAttemptError(error instanceof Error ? error.message : 'Could not submit attempt')
    } finally {
      setSubmittingAttempt(false)
    }
  }, [activeAttemptLesson, attemptAnswers, id, loadCourse])

  useEffect(() => {
    if (!activeAttemptLesson?.quiz || attemptTimeLeftSec !== 0 || attemptAutoSubmitted || attemptResult || submittingAttempt) return

    setAttemptAutoSubmitted(true)
    setAttemptError('Time is up. Submitting your current answers...')
    void handleAttemptSubmission(true)
  }, [activeAttemptLesson, attemptAutoSubmitted, attemptResult, attemptTimeLeftSec, handleAttemptSubmission, submittingAttempt])

  async function onSubmitAttempt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await handleAttemptSubmission(false)
  }

  async function onSaveQuizSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!activeQuizLessonId || !id) return

    setQuizError('')
    const title = quizTitle.trim()
    const passingScore = Number(quizPassingScore)
    const timeLimitMin = quizTimeLimit.trim() === '' ? null : Number(quizTimeLimit)
    const maxAttempts = quizMaxAttempts.trim() === '' ? null : Number(quizMaxAttempts)
    const accessScope = quizAccessScope
    const accessGroupId = accessScope === 'group' ? quizAccessGroupId.trim() || null : null
    const availableFrom = quizAvailableFrom.trim() ? new Date(quizAvailableFrom).toISOString() : null
    const availableTo = quizAvailableTo.trim() ? new Date(quizAvailableTo).toISOString() : null

    if (!title) {
      setQuizError('Test title is required.')
      return
    }
    if (!Number.isInteger(passingScore) || passingScore < 1 || passingScore > 100) {
      setQuizError('Passing score must be between 1 and 100.')
      return
    }
    if (timeLimitMin != null && (!Number.isInteger(timeLimitMin) || timeLimitMin <= 0)) {
      setQuizError('Time limit must be a positive number.')
      return
    }
    if (maxAttempts != null && (!Number.isInteger(maxAttempts) || maxAttempts <= 0)) {
      setQuizError('Try limit must be a positive whole number or left empty for unlimited attempts.')
      return
    }
    if (availableFrom != null && Number.isNaN(Date.parse(availableFrom))) {
      setQuizError('Availability start time is invalid.')
      return
    }
    if (availableTo != null && Number.isNaN(Date.parse(availableTo))) {
      setQuizError('Availability end time is invalid.')
      return
    }
    if (availableFrom != null && availableTo != null && Date.parse(availableTo) <= Date.parse(availableFrom)) {
      setQuizError('Availability end time must be later than the start time.')
      return
    }
    if (accessScope === 'group' && !accessGroupId) {
      setQuizError('Choose a group when this test should be opened only for a selected group.')
      return
    }

    const questions = quizQuestions
      .map(question => ({
        prompt: question.prompt.trim(),
        questionType: question.questionType,
        acceptedAnswer: question.acceptedAnswer.trim(),
        options: question.options.map(option => ({ text: option.text.trim(), isCorrect: option.isCorrect })).filter(option => option.text !== ''),
      }))
      .filter(question => question.prompt !== '')

    if (questions.length === 0) {
      setQuizError('Add at least one question.')
      return
    }

    for (const question of questions) {
      if (question.questionType === 'open-answer') {
        if (!question.acceptedAnswer) {
          setQuizError('Each open-answer question needs at least one accepted answer.')
          return
        }
        continue
      }
      if (question.questionType === 'true-false') {
        if (question.options.length !== 2 || question.options.filter(option => option.isCorrect).length !== 1) {
          setQuizError('Each true/false question must keep exactly one correct answer.')
          return
        }
        continue
      }
      if (question.options.length < 2) {
        setQuizError('Each choice question needs at least two filled answer options.')
        return
      }
      if (!question.options.some(option => option.isCorrect)) {
        setQuizError('Each choice question needs at least one correct answer.')
        return
      }
      if (question.questionType === 'single-choice' && question.options.filter(option => option.isCorrect).length !== 1) {
        setQuizError('Single-choice questions must have exactly one correct answer.')
        return
      }
    }

    const payload: CreateLessonQuizInput = {
      title,
      description: quizDescription.trim(),
      passingScore,
      timeLimitMin,
      maxAttempts,
      accessScope,
      accessGroupId,
      availableFrom,
      availableTo,
      questions,
    }

    setSavingQuiz(true)
    try {
      await createLessonQuiz(activeQuizLessonId, payload)
      closeQuizBuilderModal()
      await loadCourse(id)
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Could not save test')
    } finally {
      setSavingQuiz(false)
    }
  }

  if (loading) return <p className="text-sm text-neutral-600">Loading course...</p>
  if (!course) return null

  const previewMode = searchParams.get('mode') === 'preview'
  const checkoutStatus = searchParams.get('checkout')
  const purchaseStatus = course.purchaseStatus ?? 'none'
  const coursePriceLabel = formatCoursePrice(course.priceCents ?? null, course.currency ?? 'PLN')
  const canManageCourse = Boolean(course.isOwner && !previewMode)

  return (
    <section className="space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
        <ChevronLeft className="size-4" /> Back
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className={[
          'overflow-hidden rounded-[30px] border border-neutral-200 bg-white transition-all duration-500',
          heroReady ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        ].join(' ')}>
          <div className="relative">
            <CourseCoverArt
              title={course.title}
              category={course.category}
              thumbnailUrl={course.thumbnailUrl}
              templateKey={course.templateKey}
              className="h-[240px] w-full rounded-none border-0 md:h-[290px]"
              showText={false}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,24,39,0.06),rgba(17,24,39,0.22)_45%,rgba(255,255,255,0.94)_100%)]" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5 md:p-6">
              <span className="rounded-full border border-white/30 bg-white/18 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white backdrop-blur">
                {course.category}
              </span>
              {canManageCourse ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <span className={`rounded-full border px-4 py-2 text-xs font-medium backdrop-blur ${course.isPublished ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700' : 'border-white/40 bg-white/16 text-white'}`}>
                    {course.isPublished ? 'Published' : 'Non posted'}
                  </span>
                  {!course.isPublished ? (
                    <button type="button" onClick={onPublishCourse} disabled={publishingCourse || Boolean(course.publishBlocked)} className="rounded-full border border-white/40 bg-white/16 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/24 disabled:opacity-60">
                      {publishingCourse ? 'Publishing...' : 'Publish course'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
              <div className={[
                'max-w-3xl rounded-[28px] border border-white/60 bg-white/76 p-5 shadow-xl shadow-black/5 backdrop-blur transition-all duration-500',
                heroReady ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
              ].join(' ')} style={{ transitionDelay: '90ms' }}>
                <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Course page</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 md:text-[2.55rem]">{course.title}</h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-7 text-neutral-700">{course.description}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,243,233,0.62))] px-5 py-5 md:px-6 md:py-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroMetaCard icon={<BookOpen className="size-4" />} label="Category" value={course.category} revealed={heroReady} delayMs={120} />
              <HeroMetaCard icon={<Sparkles className="size-4" />} label="Level" value={formatLevel(course.level)} revealed={heroReady} delayMs={180} />
              <HeroMetaCard icon={<Clock className="size-4" />} label="Duration" value={`${totalMin} min`} revealed={heroReady} delayMs={240} />
              <HeroMetaCard icon={<Users className="size-4" />} label="Participants" value={`${course.stats.students} students`} revealed={heroReady} delayMs={300} />
            </div>
            <div className={[
              'mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-600 transition-all duration-500',
              heroReady ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            ].join(' ')} style={{ transitionDelay: '340ms' }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 shadow-sm"><Star className="size-4 fill-amber-400 text-amber-500" /> {averageRatingLabel} rating</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 shadow-sm">{reviewsLabel}</span>
            </div>
            {publishingError ? <p className="mt-3 text-sm text-red-600">{publishingError}</p> : null}
          </div>
        </div>

        <aside className={[
          'h-fit rounded-[28px] border border-neutral-200 bg-white p-5 transition-all duration-500',
          heroReady ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        ].join(' ')} style={{ transitionDelay: '180ms' }}>
          <div className="rounded-[26px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(247,243,233,0.9),_rgba(255,255,255,1)_58%,_rgba(235,241,237,0.88))] p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Course author</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="grid size-16 place-items-center rounded-[22px] border border-white/80 bg-white text-lg font-semibold text-neutral-900 shadow-sm" aria-hidden>
                {getNameInitials(course.author)}
              </div>
              <div className="min-w-0">
                {course.authorId && !course.authorProfileBlocked ? (
                  <Link to={`/profile/${course.authorId}`} className="block truncate text-xl font-semibold text-neutral-950 underline-offset-4 hover:underline">{course.author}</Link>
                ) : <div className="truncate text-xl font-semibold text-neutral-950">{course.author}</div>}
                <p className="mt-1 text-sm text-neutral-600">Teacher profile and course creator</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5">{course.category}</span>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5">{formatLevel(course.level)}</span>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5">{course.accessMode === 'class-only' ? 'Class-only access' : course.accessMode === 'public-paid' ? 'Public paid access' : course.isPublished ? 'Open for enrollment' : 'Ready to publish'}</span>
            </div>
          </div>

          {course.viewerRole === 'Admin' && !course.isOwner ? (
            <div className="mt-4 rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.76))] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Admin moderation</p>
              <p className="mt-3 text-sm leading-6 text-neutral-600">Block course publishing when the course should stay in draft, and leave a visible explanation for the author.</p>
              <label className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800">
                <input type="checkbox" checked={adminPublishBlocked} onChange={event => setAdminPublishBlocked(event.target.checked)} />
                Block publishing for this course
              </label>
              <label className="mt-3 grid gap-2">
                <span className="text-sm text-neutral-600">Message for the author</span>
                <textarea
                  rows={4}
                  value={adminPublishBlockMessage}
                  onChange={event => setAdminPublishBlockMessage(event.target.value)}
                  className="rounded-2xl border border-neutral-200 bg-white px-3 py-2"
                  placeholder="Explain why this course cannot be published yet"
                />
              </label>
              {publishModerationError ? <p className="mt-3 text-sm text-red-600">{publishModerationError}</p> : null}
              <button type="button" onClick={onSavePublishModeration} disabled={savingPublishModeration} className="mt-3 w-full rounded-full border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60">
                {savingPublishModeration ? 'Saving moderation...' : 'Save moderation'}
              </button>
            </div>
          ) : null}

          <div className="mt-4 rounded-[24px] border border-neutral-200 bg-neutral-50/70 p-4">
            {canManageCourse ? (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-neutral-600">You are the course owner. Publish the course when you are ready to let learners enroll, join classes, and solve tests.</p>
                {course.publishBlocked ? (
                  <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                    {course.publishBlockMessage || 'Publishing this course was blocked by Admin.'}
                  </div>
                ) : null}
                {!course.isPublished ? (
                  <button type="button" onClick={onPublishCourse} disabled={publishingCourse || Boolean(course.publishBlocked)} className="w-full rounded-full bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {publishingCourse ? 'Publishing...' : 'Publish course'}
                  </button>
                ) : null}
              </div>
            ) : course.hasClassAccess ? (
              <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                You can access this course through your class assignment and participate in the lessons and tests available there.
              </div>
            ) : course.isEnrolled ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
                You are enrolled in this course and can participate in the lessons and tests.
              </div>
                        ) : course.hasAdminBypass ? (
              <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                Admin billing bypass is active for this account. You can review premium and paid course content without checkout.
              </div>
            ) : course.requiresPurchase ? (
              <div className="space-y-3">
                <div className="rounded-[20px] border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Paid access</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm leading-6 text-neutral-600">This course uses Stripe Checkout for public paid access. Class-assigned learners still keep access through their classroom.</p>
                    {coursePriceLabel ? <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm font-medium text-neutral-900">{coursePriceLabel}</span> : null}
                  </div>
                </div>
                {purchaseStatus === 'pending' ? (
                  <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
                    Payment is still being confirmed or you have an unfinished checkout session. If access does not appear after a moment, you can open checkout again.
                  </div>
                ) : null}
                {purchaseStatus === 'failed' ? (
                  <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    The last payment attempt did not complete. You can safely open checkout again and try once more.
                  </div>
                ) : null}
                <button type="button" onClick={onBuyCourseAccess} disabled={buyingCourseAccess || course.checkoutEligible === false} className="w-full rounded-full bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {buyingCourseAccess ? 'Opening checkout...' : purchaseStatus === 'pending' ? 'Open checkout again' : 'Buy access'}
                </button>
              </div>
            ) : course.accessMode === 'class-only' ? (
              <div className="rounded-[20px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-700">
                This course is available only through assigned classes.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-neutral-600">Join this course to keep it on your Home screen and participate in available lessons and tests.</p>
                <button onClick={onEnrollCourse} disabled={!course.canPublicEnroll || enrollingCourse} className="w-full rounded-full bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {enrollingCourse ? 'Enrolling...' : course.canPublicEnroll ? 'Enroll for free' : 'Public enrollment unavailable'}
                </button>
              </div>
            )}

            {checkoutStatus === 'success' ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Checkout completed. If access does not appear immediately, Stripe may still be finishing the webhook confirmation for this purchase.
              </div>
            ) : checkoutStatus === 'cancelled' ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Checkout was cancelled before payment finished. You can come back any time and try again.
              </div>
            ) : null}
            {enrollError ? <p className="mt-3 text-sm text-red-600">{enrollError}</p> : null}
          </div>


          {course.isOwner && course.storage ? (
            <div className="mt-4 rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(243,246,255,0.82))] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Course storage</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Your current plan gives this course {course.storage.limitGb.toFixed(2)} GB of total storage for lesson and learner uploads.</p>
                </div>
                <span className={[
                  'rounded-full border px-3 py-1 text-sm font-medium',
                  course.viewerSubscriptionPlan === 'plus' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700',
                ].join(' ')}>
                  {course.viewerSubscriptionPlan === 'plus' ? 'InteLections+' : 'Free'}
                </span>
              </div>
              {course.storage.usagePercent >= 100 ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                  This course reached its storage limit. Remove or replace files, or upgrade the plan to keep uploading comfortably.
                </div>
              ) : course.storage.usagePercent >= 80 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  This course is close to its storage limit. Consider cleaning unused files before your next upload.
                </div>
              ) : null}
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={[
                    'h-full rounded-full transition-all',
                    course.storage.usagePercent >= 90 ? 'bg-red-500' : course.storage.usagePercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500',
                  ].join(' ')}
                  style={{ width: `${Math.max(course.storage.usagePercent, 3)}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Used</p>
                  <p className="mt-2 font-medium text-neutral-900">{course.storage.usedMb.toFixed(1)} MB</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Remaining</p>
                  <p className="mt-2 font-medium text-neutral-900">{course.storage.remainingGb.toFixed(2)} GB</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Limit</p>
                  <p className="mt-2 font-medium text-neutral-900">{course.storage.limitGb.toFixed(2)} GB</p>
                </div>
              </div>
            </div>
          ) : null}
          {!course.isOwner ? (
            <div className="mt-4 rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(248,245,236,0.82))] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Course rating</p>
              <div className="mt-3 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(stars => {
                  const active = Number(course.viewerRating ?? 0) >= stars
                  return (
                    <button
                      key={stars}
                      type="button"
                      onClick={() => onRateCourse(stars)}
                      disabled={!course.canRate || ratingCourse}
                      className="rounded-full border border-neutral-200 bg-white p-2 text-neutral-300 transition hover:border-amber-200 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Rate ${stars} star${stars === 1 ? '' : 's'}`}
                    >
                      <Star className={`size-5 ${active ? "fill-amber-400 text-amber-500" : "text-neutral-300"}`} />
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                {course.viewerRating
                  ? `Your rating: ${course.viewerRating} / 5. You can update it anytime.`
                  : course.canRate
                    ? 'Leave a star rating to help other learners understand the quality of this course.'
                    : 'Enroll in the course first to leave a rating.'}
              </p>
              {ratingError ? <p className="mt-2 text-sm text-red-600">{ratingError}</p> : null}
            </div>
          ) : null}
          {!course.isOwner ? (
            <div className="mt-4 rounded-[24px] border border-neutral-200 bg-white p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Written review</p>
              {course.canRate ? (
                <form className="mt-3 space-y-3" onSubmit={event => void onSubmitReview(event)}>
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Review title</span>
                    <input value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} className="rounded-2xl border border-neutral-200 px-3 py-2" placeholder="What stood out in this course?" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Your opinion</span>
                    <textarea value={reviewText} onChange={event => setReviewText(event.target.value)} rows={4} className="rounded-2xl border border-neutral-200 px-3 py-2" placeholder="Share what helped, what felt clear, and what future learners should know." />
                  </label>
                  <p className="text-sm leading-6 text-neutral-600">{course.viewerRating ? `This review will be published with your current ${course.viewerRating}/5 rating.` : 'Choose a star rating first, then add your review.'}</p>
                  {course.viewerReview?.updatedAt ? <p className="text-xs text-neutral-500">Last updated {new Date(course.viewerReview.updatedAt).toLocaleDateString()}</p> : null}
                  {reviewError ? <p className="text-sm text-red-600">{reviewError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={savingReview || deletingReview || ratingCourse} className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                      {savingReview ? 'Saving review...' : hasWrittenReview ? 'Update review' : 'Save review'}
                    </button>
                    {hasWrittenReview ? (
                      <button type="button" onClick={() => void onDeleteReview()} disabled={savingReview || deletingReview} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60">
                        {deletingReview ? 'Deleting...' : 'Delete review'}
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <p className="mt-3 text-sm leading-6 text-neutral-600">Enroll in the course first to leave a written review.</p>
              )}
            </div>
          ) : null}
          {course.courseGroups && course.courseGroups.length > 0 ? (
            <div className="mt-4 rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.72))] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">{course.isOwner ? 'Assigned classes' : 'Available through classes'}</p>
              <div className="mt-3 space-y-3">
                {course.courseGroups.map(group => (
                  <div key={group.id} className="rounded-[20px] border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                    <p className="font-medium text-neutral-900">{group.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-600">
                      {group.meetingLabel ? <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">{group.meetingLabel}</span> : null}
                      {group.locationLabel ? <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">{group.locationLabel}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Syllabus</h2>
            <p className="text-sm text-neutral-500">Published courses can be joined by students. Enrolled participants can solve the tests and get scored automatically.</p>
          </div>
          {canManageCourse ? (
            <button type="button" onClick={() => setShowAddLesson(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-neutral-50">
              <Plus className="size-4" /> Add Lection
            </button>
          ) : null}
        </div>

        {materialsError ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{materialsError}</div> : null}

        <ul className="divide-y">
          {course.lessons.map(lesson => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              canManage={canManageCourse}
              canAccessPaidContents={Boolean(course.canAccessPaidContents)}
              canTakeQuiz={Boolean(!course.isOwner && lesson.quiz && ((course.isPublished && course.isEnrolled) || course.hasClassAccess))}
              dragState={{
                draggedMaterialId,
                dragTargetKey,
                savingLayout: savingLayoutLessonId === lesson.id,
              }}
              onEditLesson={() => openLessonEditor(lesson)}
              onAddMaterials={() => openMaterialsModal(lesson)}
              onCreateFolder={() => openSectionEditor(lesson)}
              onEditFolder={section => openSectionEditor(lesson, section)}
              onDeleteFolder={onDeleteSection}
              onBuildQuiz={() => openQuizBuilderModal(lesson)}
              onTakeQuiz={() => openAttemptModal(lesson)}
              onEditMaterial={material => openMaterialEditor(material, lesson.id)}
              onDeleteMaterial={onDeleteMaterial}
              onMaterialDragStart={materialId => setDraggedMaterialId(materialId)}
              onMaterialDragEnd={clearDragState}
              onMaterialDragTargetChange={setDragTargetKey}
              onDropMaterial={(targetSectionId, targetMaterialId) => onSaveMaterialDrop(lesson, targetSectionId, targetMaterialId)}
              deletingMaterialId={deletingMaterialId}
              deletingSectionId={deletingSectionId}
            />
          ))}
        </ul>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Learner reviews</h2>
            <p className="text-sm text-neutral-500">Text opinions from enrolled learners and class participants add context beyond the star score.</p>
          </div>
          <div className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">{reviewsLabel}</div>
        </div>

        <div className="mt-5 space-y-3">
          {(course.courseReviews ?? []).map(review => (
            <article key={review.userId} className="rounded-[24px] border border-neutral-200 bg-neutral-50 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {review.profileBlocked ? (
                    <span className="font-medium text-neutral-900">{review.name}</span>
                  ) : (
                    <Link to={`/profile/${review.userId}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">{review.name}</Link>
                  )}
                  <div className="mt-2 flex items-center gap-1 text-amber-500">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star key={index} className={`size-4 ${index < review.stars ? 'fill-amber-400 text-amber-500' : 'text-neutral-300'}`} />
                    ))}
                  </div>
                </div>
                <span className="text-sm text-neutral-500">{review.updatedAt ? new Date(review.updatedAt).toLocaleDateString() : ''}</span>
              </div>
              {review.title ? <h3 className="mt-3 text-base font-semibold text-neutral-900">{review.title}</h3> : null}
              {review.text ? <p className="mt-2 text-sm leading-7 text-neutral-600">{review.text}</p> : null}
            </article>
          ))}
          {(course.courseReviews ?? []).length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-500">
              No written reviews yet. The first thoughtful learner opinion will appear here.
            </div>
          ) : null}
        </div>
      </section>

      {(course.isOwner || course.allowLearnerUploads) && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Learner materials</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                {course.isOwner
                  ? course.allowLearnerUploads
                    ? 'Students can drop their own supporting files here. You can review everything uploaded for this course.'
                    : 'Learner uploads are currently disabled for this course. You can enable them from My Products while editing the course card.'
                  : 'Use this area to upload your own supporting files for the course without mixing them into the author syllabus.'}
              </p>
            </div>
            {course.allowLearnerUploads ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Uploads enabled</span>
            ) : course.isOwner ? (
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">Disabled</span>
            ) : null}
          </div>

          {course.learnerUploadNote ? (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.72))] px-4 py-3 text-sm leading-6 text-neutral-700">
              {course.learnerUploadNote}
            </div>
          ) : null}

          {!course.isOwner && course.allowLearnerUploads && (course.isEnrolled || course.hasClassAccess) && course.viewerSubscriptionPlan === 'plus' ? (
            <form className="mt-5 grid gap-3 rounded-[24px] border border-neutral-200 bg-neutral-50 p-4" onSubmit={onUploadLearnerMaterial}>
              <div className="text-sm font-medium text-neutral-900">Upload your material</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-sm text-neutral-600">File</span>
                  <input
                    type="file"
                    onChange={e => setLearnerMaterialDraft((current: LearnerMaterialUploadDraft) => ({ ...current, file: e.target.files?.[0] ?? null }))}
                    className="rounded-lg border bg-white px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-sm text-neutral-600">Title (optional)</span>
                  <input
                    value={learnerMaterialDraft.title}
                    onChange={e => setLearnerMaterialDraft((current: LearnerMaterialUploadDraft) => ({ ...current, title: e.target.value }))}
                    className="rounded-lg border bg-white px-3 py-2"
                    placeholder="e.g. My worksheet notes"
                  />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-sm text-neutral-600">Description (optional)</span>
                  <textarea
                    rows={3}
                    value={learnerMaterialDraft.description}
                    onChange={e => setLearnerMaterialDraft((current: LearnerMaterialUploadDraft) => ({ ...current, description: e.target.value }))}
                    className="rounded-lg border bg-white px-3 py-2"
                    placeholder="Add a short note about what you are uploading"
                  />
                </label>
              </div>
              {learnerMaterialError ? <p className="text-sm text-red-600">{learnerMaterialError}</p> : null}
              <div className="flex justify-end">
                <button type="submit" disabled={savingLearnerMaterial} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                  {savingLearnerMaterial ? 'Uploading...' : 'Upload material'}
                </button>
              </div>
            </form>
          ) : !course.isOwner && course.allowLearnerUploads && (course.isEnrolled || course.hasClassAccess) ? (
            <div className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Learner uploads in this course are part of <span className="font-semibold">InteLections+</span>. Upgrade in <Link to="/account" className="font-medium underline underline-offset-4">My Profile</Link> to upload your own study files here.
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {(course.learnerMaterials ?? []).length > 0 ? (
              (course.learnerMaterials ?? []).map(material => (
                <div key={material.id} className="rounded-[22px] border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-neutral-900">{material.title}</div>
                      <div className="mt-1 text-sm text-neutral-500">{material.originalName}</div>
                    </div>
                    <a href={material.filePath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                      Open file
                      <SquareArrowOutUpRight className="size-4" />
                    </a>
                  </div>
                  {material.description ? <p className="mt-3 text-sm leading-6 text-neutral-700">{material.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">{formatFileSize(material.fileSizeBytes)}</span>
                    {material.uploadedAt ? <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">Uploaded {new Date(material.uploadedAt).toLocaleDateString()}</span> : null}
                    {course.isOwner && material.uploadedByName ? <span className="rounded-full border border-neutral-200 bg-white px-3 py-1">By {material.uploadedByName}</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-500">
                {course.isOwner
                  ? course.allowLearnerUploads
                    ? 'No learner materials uploaded yet.'
                    : 'Learner uploads are disabled for this course.'
                  : course.allowLearnerUploads
                    ? 'You have not uploaded any learner materials for this course yet.'
                    : 'Learner uploads are not enabled for this course.'}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddLesson && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create Lection</h3>
              <button type="button" onClick={() => setShowAddLesson(false)} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
            </div>
            <form className="space-y-3" onSubmit={onAddLessonSubmit}>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Lection title</span>
                <input value={lessonTitle} onChange={e => setLessonTitle(e.target.value)} className="rounded-lg border px-3 py-2" placeholder="e.g. Ancient Egypt Overview" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Estimate Duration (minutes)</span>
                <input type="number" min={1} value={lessonDuration} onChange={e => setLessonDuration(e.target.value)} className="rounded-lg border px-3 py-2" />
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={lessonPreview} onChange={e => setLessonPreview(e.target.checked)} />
                <span className="text-sm text-neutral-700">Mark as free preview</span>
              </label>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddLesson(false)} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={savingLesson} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{savingLesson ? 'Saving...' : 'Create Lection'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeLessonEditor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit lesson</h3>
              <button type="button" onClick={closeLessonEditor} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
            </div>
            <form className="space-y-3" onSubmit={onSaveLessonEdit}>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Lesson title</span>
                <input value={activeLessonEditor.title} onChange={e => setActiveLessonEditor((current: LessonEditDraft | null) => current ? { ...current, title: e.target.value } : current)} className="rounded-lg border px-3 py-2" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Estimated duration (minutes)</span>
                <input type="number" min={1} value={activeLessonEditor.durationMin} onChange={e => setActiveLessonEditor((current: LessonEditDraft | null) => current ? { ...current, durationMin: e.target.value } : current)} className="rounded-lg border px-3 py-2" />
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={activeLessonEditor.isFreePreview} onChange={e => setActiveLessonEditor((current: LessonEditDraft | null) => current ? { ...current, isFreePreview: e.target.checked } : current)} />
                <span className="text-sm text-neutral-700">Mark as free preview</span>
              </label>
              {lessonEditError ? <p className="text-sm text-red-600">{lessonEditError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeLessonEditor} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={savingLessonEdit} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{savingLessonEdit ? 'Saving...' : 'Save lesson'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeMaterialsLesson && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold">Add lesson materials</h3>
                <p className="text-sm text-neutral-500">Upload podcast audio, documents, and hosted lesson videos up to 250 MB per file, or embed a YouTube lesson without storing the video in InteLections.</p>
              </div>
              <button type="button" onClick={closeMaterialsModal} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
            </div>
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={onAddMaterialsSubmit}>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${course?.viewerSubscriptionPlan === 'plus' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {course?.viewerSubscriptionPlan === 'plus'
                  ? 'InteLections+ is active for this account. Hosted lesson videos up to 30 minutes and 250 MB per file are available, along with audio, downloadable files, and a 25 GB course storage limit.'
                  : 'Free accounts can upload hosted lesson videos up to 5 minutes and 250 MB per file. Upgrade to InteLections+ for up to 30 minutes, plus a 25 GB course storage limit.'}
              </div>
              <label className="grid gap-2">
                <span className="text-sm text-neutral-600">Choose one or more files</span>
                <input
                  type="file"
                  multiple
                  accept="video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  onChange={e => setMaterialDrafts(Array.from(e.target.files ?? []).map(file => ({ file, description: '', sectionId: null })))}
                  className="rounded-lg border px-3 py-2"
                />
              </label>
              {materialDrafts.length > 0 ? (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-sm font-medium text-neutral-700">Files ready to upload</div>
                  <div className="mt-3 space-y-3">
                    {materialDrafts.map((item, index) => (
                      <div key={`${item.file.name}-${item.file.size}`} className="rounded-xl border border-neutral-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3 text-sm text-neutral-600">
                          <span className="truncate font-medium text-neutral-800">{item.file.name}</span>
                          <span>{formatFileSize(item.file.size)}</span>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 md:col-span-2">
                            <span className="text-sm text-neutral-600">Description (optional)</span>
                            <textarea
                              rows={2}
                              value={item.description}
                              onChange={e => setMaterialDrafts(current => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, description: e.target.value } : draft))}
                              className="rounded-lg border px-3 py-2"
                              placeholder="Explain what this file contains or how the learner should use it"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-sm text-neutral-600">Folder</span>
                            <select
                              value={item.sectionId ?? ''}
                              onChange={e => setMaterialDrafts(current => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, sectionId: normalizeSectionId(e.target.value) } : draft))}
                              className="rounded-lg border bg-white px-3 py-2"
                            >
                              <option value="">No folder (loose materials)</option>
                              {sortSections(activeMaterialsLesson.materialSections).map(section => (
                                <option key={section.id} value={section.id}>{formatSectionOptionLabel(section)}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-sm font-medium text-neutral-800">Embed a YouTube video</div>
                <p className="mt-1 text-sm leading-6 text-neutral-500">Paste a full YouTube link. The lesson will show an embedded player and start at the timestamp included in the URL, without downloading the video.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-sm text-neutral-600">YouTube link</span>
                    <input
                      value={youtubeDraft.youtubeUrl}
                      onChange={e => setYoutubeDraft(current => ({ ...current, youtubeUrl: e.target.value }))}
                      className="rounded-lg border bg-white px-3 py-2"
                      placeholder="https://www.youtube.com/watch?v=...&t=90s"
                    />
                  </label>
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-sm text-neutral-600">Card title (optional)</span>
                    <input
                      value={youtubeDraft.title}
                      onChange={e => setYoutubeDraft(current => ({ ...current, title: e.target.value }))}
                      className="rounded-lg border bg-white px-3 py-2"
                      placeholder="e.g. Lecture walkthrough"
                    />
                  </label>
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-sm text-neutral-600">Description (optional)</span>
                    <textarea
                      rows={3}
                      value={youtubeDraft.description}
                      onChange={e => setYoutubeDraft(current => ({ ...current, description: e.target.value }))}
                      className="rounded-lg border bg-white px-3 py-2"
                      placeholder="Explain what the learner should focus on in this video"
                    />
                  </label>
                  <label className="grid gap-1 md:max-w-xs">
                    <span className="text-sm text-neutral-600">Folder</span>
                    <select
                      value={youtubeDraft.sectionId ?? ''}
                      onChange={e => setYoutubeDraft(current => ({ ...current, sectionId: normalizeSectionId(e.target.value) }))}
                      className="rounded-lg border bg-white px-3 py-2"
                    >
                      <option value="">No folder (loose materials)</option>
                      {sortSections(activeMaterialsLesson.materialSections).map(section => (
                        <option key={section.id} value={section.id}>{formatSectionOptionLabel(section)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {materialsError && <p className="text-sm text-red-600">{materialsError}</p>}
              </div>
              <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4">
                <button type="button" onClick={closeMaterialsModal} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={savingMaterials} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{savingMaterials ? 'Saving...' : 'Add materials'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeMaterialEditor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Edit material</h3>
                <p className="text-sm text-neutral-500">Update the material card title, learning note and folder placement. File materials can be replaced, while YouTube materials keep an editable video link.</p>
              </div>
              <button type="button" onClick={closeMaterialEditor} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
            </div>
            <form className="space-y-4" onSubmit={onSaveMaterialEdit}>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Card title</span>
                <input
                  value={activeMaterialEditor.title}
                  onChange={e => setActiveMaterialEditor(current => current ? { ...current, title: e.target.value } : current)}
                  className="rounded-lg border px-3 py-2"
                  placeholder="Short material title"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Description</span>
                <textarea
                  rows={4}
                  value={activeMaterialEditor.description}
                  onChange={e => setActiveMaterialEditor(current => current ? { ...current, description: e.target.value } : current)}
                  className="rounded-lg border px-3 py-2"
                  placeholder="Explain what the learner should open, watch, listen to, or download here"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Folder</span>
                <select
                  value={activeMaterialEditor.sectionId ?? ''}
                  onChange={e => setActiveMaterialEditor(current => current ? { ...current, sectionId: normalizeSectionId(e.target.value) } : current)}
                  className="rounded-lg border bg-white px-3 py-2"
                >
                  <option value="">No folder (loose materials)</option>
                  {sortSections(activeMaterialLesson?.materialSections ?? []).map(section => (
                    <option key={section.id} value={section.id}>{formatSectionOptionLabel(section)}</option>
                  ))}
                </select>
              </label>
              {activeMaterialEditor.materialKind === 'youtube' ? (
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">YouTube link</span>
                  <input
                    value={activeMaterialEditor.youtubeUrl}
                    onChange={e => setActiveMaterialEditor(current => current ? { ...current, youtubeUrl: e.target.value } : current)}
                    className="rounded-lg border px-3 py-2"
                    placeholder="https://www.youtube.com/watch?v=...&t=90s"
                  />
                </label>
              ) : (
                <>
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Replace file (optional)</span>
                    <input
                      type="file"
                      accept="video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                      onChange={e => setActiveMaterialEditor(current => current ? { ...current, replacementFile: e.target.files?.[0] ?? null } : current)}
                      className="rounded-lg border px-3 py-2"
                    />
                  </label>
                  {activeMaterialEditor.replacementFile ? (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                    New file ready: <span className="font-medium">{activeMaterialEditor.replacementFile.name}</span>
                  </div>
                ) : null}
                </>
              )}
              {materialEditError ? <p className="text-sm text-red-600">{materialEditError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeMaterialEditor} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={savingMaterialEdit} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{savingMaterialEdit ? 'Saving...' : 'Save material'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeSectionEditor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{activeSectionEditor.id ? 'Edit folder' : 'Create folder'}</h3>
                <p className="text-sm text-neutral-500">Use folders to group files inside long lessons and keep materials easier to scan.</p>
              </div>
              <button type="button" onClick={closeSectionEditor} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
            </div>
            <form className="space-y-4" onSubmit={onSaveSectionSubmit}>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Folder title</span>
                <input
                  value={activeSectionEditor.title}
                  onChange={e => setActiveSectionEditor(current => current ? { ...current, title: e.target.value } : current)}
                  className="rounded-lg border px-3 py-2"
                  placeholder="e.g. Source pack, Lecture slides, Homework files"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm text-neutral-600">Description (optional)</span>
                <textarea
                  rows={3}
                  value={activeSectionEditor.description}
                  onChange={e => setActiveSectionEditor(current => current ? { ...current, description: e.target.value } : current)}
                  className="rounded-lg border px-3 py-2"
                  placeholder="Brief note about what belongs in this folder"
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={activeSectionEditor.isPaidContent}
                  onChange={e => setActiveSectionEditor(current => current ? { ...current, isPaidContent: e.target.checked } : current)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-neutral-900">Paid contents</span>
                  <span className="block text-neutral-500">Blur this folder for viewers without full course access and block files, video, and audio playback.</span>
                </span>
              </label>
              {sectionError ? <p className="text-sm text-red-600">{sectionError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeSectionEditor} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={savingSection} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{savingSection ? 'Saving...' : 'Save folder'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeQuizLessonId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto my-6 w-full max-w-4xl rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Build lesson test</h3>
                <p className="text-sm text-neutral-500">Support now includes single-choice, multi-select, true/false and open-answer questions.</p>
              </div>
              <button type="button" onClick={closeQuizBuilderModal} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
            </div>
            <form className="space-y-5" onSubmit={onSaveQuizSubmit}>
              {canManageCourse ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-700">
                        <Sparkles className="size-3.5" /> AI draft helper
                      </div>
                      <h4 className="text-base font-semibold text-neutral-900">Generate with AI</h4>
                      <p className="text-sm text-neutral-600">Create an editable draft quiz from the lesson title, metadata and material descriptions. Nothing is saved until you review and click Save test.</p>
                      <p className="text-xs text-neutral-500">Usually takes about 10-30 seconds, depending on OpenAI response time, current quota, and lesson context size.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAiQuizPanel(current => !current)}
                      disabled={!course.quizGenerationAvailable || generatingQuiz}
                      className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="size-4" /> {showAiQuizPanel ? 'Hide AI options' : 'Generate with AI'}
                    </button>
                  </div>

                  {!course.quizGenerationAvailable && course.quizGenerationReason ? (
                    <div className="mt-3 rounded-xl border border-dashed border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-500">
                      <p>{course.quizGenerationReason}</p>
                      <p className="mt-2 text-xs text-neutral-400">Defense fallback: keep the builder open, create the test manually, or use a previously generated draft if OpenAI quota or configuration is temporarily unavailable.</p>
                    </div>
                  ) : null}

                  {showAiQuizPanel && course.quizGenerationAvailable ? (
                    <div className="mt-4 space-y-4 rounded-2xl border border-neutral-200 bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <span className="text-sm text-neutral-600">How many questions</span>
                          <div className="flex flex-wrap gap-2">
                            {['4', '6', '8'].map(count => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setAiQuestionCount(count)}
                                className={`rounded-full border px-3 py-1.5 text-sm transition ${aiQuestionCount === count ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                              >
                                {count} questions
                              </button>
                            ))}
                          </div>
                          <label className="grid gap-1">
                            <span className="text-xs text-neutral-500">Custom count (3-10)</span>
                            <input type="number" min={3} max={10} value={aiQuestionCount} onChange={e => setAiQuestionCount(e.target.value)} className="rounded-lg border px-3 py-2" />
                          </label>
                        </div>
                        <label className="grid gap-1">
                          <span className="text-sm text-neutral-600">Difficulty</span>
                          <select value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value as 'easy' | 'mixed' | 'challenging')} className="rounded-lg border bg-white px-3 py-2">
                            <option value="easy">Easy</option>
                            <option value="mixed">Mixed</option>
                            <option value="challenging">Challenging</option>
                          </select>
                        </label>
                      </div>

                      <div className="space-y-2">
                        <span className="text-sm text-neutral-600">Preferred question types</span>
                        <div className="flex flex-wrap gap-2">
                          {(['single-choice', 'multi-select', 'true-false', 'open-answer'] as QuestionType[]).map(questionType => (
                            <button
                              key={questionType}
                              type="button"
                              onClick={() => toggleAiPreferredQuestionType(questionType)}
                              className={`rounded-full border px-3 py-1.5 text-sm transition ${aiPreferredQuestionTypes.includes(questionType) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'}`}
                            >
                              {questionType === 'single-choice' ? 'Single choice' : questionType === 'multi-select' ? 'Multi-select' : questionType === 'true-false' ? 'True / False' : 'Open answer'}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-neutral-500">Leave one or more types selected. If all are cleared, AI falls back to a balanced default.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="grid gap-1">
                          <span className="text-sm text-neutral-600">Teacher instruction (optional)</span>
                          <textarea value={aiTeacherInstruction} onChange={e => setAiTeacherInstruction(e.target.value)} rows={3} className="rounded-lg border px-3 py-2" placeholder="Example: focus on chronology, avoid open answers, or include one multi-select question." />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            'Focus on chronology and key events',
                            'Emphasise polis citizenship and civic participation',
                            'Avoid open answers and keep it exam-friendly',
                          ].map(suggestion => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => setAiTeacherInstruction(suggestion)}
                              className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 transition hover:bg-neutral-100"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button type="button" onClick={onGenerateQuizWithAi} disabled={generatingQuiz} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                          <Sparkles className="size-4" /> {generatingQuiz ? 'Generating draft...' : 'Generate draft'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1 md:col-span-3">
                  <span className="text-sm text-neutral-600">Test title</span>
                  <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)} className="rounded-lg border px-3 py-2" placeholder="e.g. Lesson 1 knowledge check" />
                </label>
                <label className="grid gap-1 md:col-span-3">
                  <span className="text-sm text-neutral-600">Short description</span>
                  <textarea value={quizDescription} onChange={e => setQuizDescription(e.target.value)} rows={3} className="rounded-lg border px-3 py-2" placeholder="Explain what the student should know before starting this test." />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">Pass (%)</span>
                  <input type="number" min={1} max={100} value={quizPassingScore} onChange={e => setQuizPassingScore(e.target.value)} className="rounded-lg border px-3 py-2" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">Time limit (min)</span>
                  <input type="number" min={1} value={quizTimeLimit} onChange={e => setQuizTimeLimit(e.target.value)} className="rounded-lg border px-3 py-2" placeholder="Leave empty for no limit" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm text-neutral-600">Tries to pass (optional)</span>
                  <input type="number" min={1} value={quizMaxAttempts} onChange={e => setQuizMaxAttempts(e.target.value)} className="rounded-lg border px-3 py-2" placeholder="Leave empty for unlimited" />
                </label>
                <div className="grid gap-4 self-start md:col-span-2">
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Test availability</span>
                    <select value={quizAccessScope} onChange={e => setQuizAccessScope(e.target.value as 'course' | 'group')} className="rounded-lg border bg-white px-3 py-2">
                      <option value="course">Open to enrolled course participants</option>
                      <option value="group">Open only for a selected group</option>
                    </select>
                  </label>
                  {quizAccessScope === 'group' ? (
                    <label className="grid gap-1">
                      <span className="text-sm text-neutral-600">Group</span>
                      <select value={quizAccessGroupId} onChange={e => setQuizAccessGroupId(e.target.value)} className="rounded-lg border bg-white px-3 py-2">
                        <option value="">Choose one of your groups</option>
                        {(course.ownerGroups ?? []).map(group => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="grid gap-4">
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Available from</span>
                    <input type="datetime-local" value={quizAvailableFrom} onChange={e => setQuizAvailableFrom(e.target.value)} className="rounded-lg border px-3 py-2" />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-neutral-600">Available to</span>
                    <input type="datetime-local" value={quizAvailableTo} onChange={e => setQuizAvailableTo(e.target.value)} className="rounded-lg border px-3 py-2" />
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-neutral-900">Questions</h4>
                    <p className="text-sm text-neutral-500">Choose the question type first, then fill only the fields needed for that type.</p>
                  </div>
                  <button type="button" onClick={addQuestion} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
                    <Plus className="size-4" /> Add question
                  </button>
                </div>

                {quizQuestions.map((question, questionIndex) => (
                  <div key={`question-${questionIndex}`} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-medium text-neutral-900">Question {questionIndex + 1}</div>
                      <button type="button" onClick={() => removeQuestion(questionIndex)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white">Remove question</button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1 md:col-span-2">
                        <span className="text-sm text-neutral-600">Prompt</span>
                        <textarea value={question.prompt} onChange={e => updateQuestionPrompt(questionIndex, e.target.value)} rows={2} className="rounded-lg border bg-white px-3 py-2" placeholder="Write the question the learner will answer." />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm text-neutral-600">Question type</span>
                        <select value={question.questionType} onChange={e => updateQuestionType(questionIndex, e.target.value as QuestionType)} className="rounded-lg border bg-white px-3 py-2">
                          <option value="single-choice">Single choice</option>
                          <option value="multi-select">Multi-select</option>
                          <option value="true-false">True / False</option>
                          <option value="open-answer">Open answer</option>
                        </select>
                      </label>
                    </div>

                    {question.questionType === 'open-answer' ? (
                      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
                        <label className="grid gap-1">
                          <span className="text-sm text-neutral-600">Accepted answers</span>
                          <textarea value={question.acceptedAnswer} onChange={e => updateOpenAnswer(questionIndex, e.target.value)} rows={3} className="rounded-lg border px-3 py-2" placeholder="One accepted answer per line or separated with |" />
                        </label>
                        <p className="text-xs text-neutral-500">Matching ignores case and allows multiple accepted variants.</p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {question.options.map((option, optionIndex) => (
                          <div key={`question-${questionIndex}-option-${optionIndex}`} className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                            <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                              <input type="checkbox" checked={option.isCorrect} onChange={e => updateOption(questionIndex, optionIndex, { isCorrect: e.target.checked })} />
                              {question.questionType === 'multi-select' ? 'Correct' : 'Selected'}
                            </label>
                            <input value={option.text} onChange={e => updateOption(questionIndex, optionIndex, { text: e.target.value })} className="rounded-lg border px-3 py-2" placeholder={question.questionType === 'true-false' ? option.text : `Answer option ${optionIndex + 1}`} disabled={question.questionType === 'true-false'} />
                            <button type="button" onClick={() => removeOption(questionIndex, optionIndex)} disabled={question.questionType === 'true-false'} className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50">Remove</button>
                          </div>
                        ))}
                        {question.questionType !== 'true-false' ? (
                          <button type="button" onClick={() => addOption(questionIndex)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-white">
                            <Plus className="size-4" /> Add answer option
                          </button>
                        ) : (
                          <p className="text-sm text-neutral-500">True/false questions keep fixed answers and you only choose which one is correct.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {quizError && <p className="text-sm text-red-600">{quizError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeQuizBuilderModal} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={savingQuiz} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{savingQuiz ? 'Saving test...' : 'Save test'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeAttemptLesson?.quiz && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto my-6 w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-5">
            {(() => {
              const totalTimeSec = (activeAttemptLesson.quiz.timeLimitMin ?? 0) * 60
              const remainingTimeSec = attemptTimeLeftSec ?? totalTimeSec
              const progressRatio = totalTimeSec > 0 ? Math.max(0, Math.min(remainingTimeSec / totalTimeSec, 1)) : 1
              const timerTone = getTimerTone(progressRatio)

              return (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">Solve lesson test</h3>
                      <p className="text-sm text-neutral-500">{activeAttemptLesson.quiz.title}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {activeAttemptLesson.quiz.timeLimitMin != null ? (
                        <div className={`rounded-full border px-3 py-1 text-sm ${timerTone.shell}`}>
                          <span className="inline-flex items-center gap-2"><Clock className="size-4" /> {formatCountdown(remainingTimeSec)}</span>
                        </div>
                      ) : null}
                      <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
                        {formatAttemptUsage(activeAttemptLesson.quiz.attemptsUsed, activeAttemptLesson.quiz.maxAttempts)}
                      </div>
                      <button type="button" onClick={closeAttemptModal} className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50">Close</button>
                    </div>
                  </div>

                  {activeAttemptLesson.quiz.timeLimitMin != null ? (
                    <div className="mb-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-neutral-500">
                        <span>Time remaining</span>
                        <span>{Math.round(progressRatio * 100)}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-white">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-linear ${timerTone.bar}`}
                          style={{ width: `${Math.max(progressRatio * 100, 0)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              )
            })()}
            <form className="space-y-5" onSubmit={onSubmitAttempt}>
              {activeAttemptLesson.quiz.questions.map((question, index) => {
                const current = attemptAnswers[question.id] ?? { questionId: question.id, answerText: '', selectedOptionIds: [] }
                const selected = new Set(current.selectedOptionIds ?? [])

                return (
                  <div key={question.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="font-medium text-neutral-900">Question {index + 1}</div>
                    <p className="mt-1 text-neutral-700">{question.prompt}</p>

                    {question.questionType === 'open-answer' ? (
                      <textarea value={current.answerText ?? ''} onChange={e => setTextAnswer(question.id, e.target.value)} rows={3} className="mt-4 w-full rounded-lg border bg-white px-3 py-2" placeholder="Write your answer" />
                    ) : (
                      <div className="mt-4 space-y-3">
                        {question.options.map(option => (
                          <label key={option.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
                            <input
                              type={question.questionType === 'multi-select' ? 'checkbox' : 'radio'}
                              name={`question-${question.id}`}
                              checked={selected.has(option.id)}
                              onChange={() => setChoiceAnswer(question.id, option.id, question.questionType === 'multi-select')}
                            />
                            <span>{option.text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {attemptResult ? (
                <div className={`rounded-2xl border px-4 py-4 ${attemptResult.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="text-lg font-semibold text-neutral-900">Result: {attemptResult.scorePercent}%</div>
                  <p className="text-sm text-neutral-700">Correct answers: {attemptResult.correctAnswers} / {attemptResult.totalQuestions}. {attemptResult.passed ? 'You passed this test.' : 'You did not reach the passing score yet.'}</p>
                </div>
              ) : null}

              {attemptError && <p className="text-sm text-red-600">{attemptError}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeAttemptModal} className="rounded-lg border px-3 py-2 hover:bg-neutral-50">Close</button>
                <button type="submit" disabled={submittingAttempt || attemptAutoSubmitted} className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60">{submittingAttempt ? 'Submitting...' : attemptAutoSubmitted ? 'Auto-submitting...' : 'Submit attempt'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

function LessonRow({
  lesson,
  canManage,
  canAccessPaidContents,
  canTakeQuiz,
  dragState,
  onEditLesson,
  onAddMaterials,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onBuildQuiz,
  onTakeQuiz,
  onEditMaterial,
  onDeleteMaterial,
  onMaterialDragStart,
  onMaterialDragEnd,
  onMaterialDragTargetChange,
  onDropMaterial,
  deletingMaterialId,
  deletingSectionId,
}: {
  lesson: Lesson
  canManage: boolean
  canAccessPaidContents: boolean
  canTakeQuiz: boolean
  dragState: {
    draggedMaterialId: string | null
    dragTargetKey: string | null
    savingLayout: boolean
  }
  onEditLesson: () => void
  onAddMaterials: () => void
  onCreateFolder: () => void
  onEditFolder: (section: LessonMaterialSection) => void
  onDeleteFolder: (section: LessonMaterialSection) => void
  onBuildQuiz: () => void
  onTakeQuiz: () => void
  onEditMaterial: (material: LessonMaterial) => void
  onDeleteMaterial: (material: LessonMaterial) => void
  onMaterialDragStart: (materialId: string) => void
  onMaterialDragEnd: () => void
  onMaterialDragTargetChange: (value: string | null) => void
  onDropMaterial: (targetSectionId: string | null, targetMaterialId?: string) => void
  deletingMaterialId: string | null
  deletingSectionId: string | null
}) {
  const buckets = getLessonBuckets(lesson, false)
  const sectionMap = new Map(lesson.materialSections.map(section => [section.id, section]))
  const hasMaterials = lesson.materials.length > 0
  const maxAttempts = lesson.quiz?.maxAttempts ?? null
  const attemptsUsed = lesson.quiz?.attemptsUsed ?? 0
  const availabilityBlocked = lesson.quiz ? lesson.quiz.canAttempt === false : false
  const noTriesLeft = maxAttempts != null && attemptsUsed >= maxAttempts
  const quizActionLabel = getQuizActionLabel(lesson)

  return (
    <li className="space-y-4 py-4">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-full border bg-neutral-100"><FileText className="size-4 text-neutral-600" /></div>
        <div className="mr-auto">
          <div className="font-medium">{lesson.title}</div>
          <div className="inline-flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            <span>{lesson.durationMin} min</span>
            {lesson.isFreePreview && <span className="rounded-full border px-2 py-0.5 text-xs">Free preview</span>}
            <span className="rounded-full border px-2 py-0.5 text-xs">{lesson.materials.length} materials</span>
            <span className="rounded-full border px-2 py-0.5 text-xs">{lesson.quiz ? `${lesson.quiz.questions.length} quiz questions` : 'No test yet'}</span>
            {lesson.quiz ? <span className="rounded-full border px-2 py-0.5 text-xs">{formatAvailabilityLabel(lesson.quiz)}</span> : null}
            {lesson.latestAttempt ? (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${lesson.latestAttempt.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                Last result: {lesson.latestAttempt.scorePercent}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4 pl-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-neutral-700">Lesson materials and test</div>
            {canManage ? (
              <p className="mt-1 text-xs text-neutral-500">Drag material cards between folders to reorder the lesson layout.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <>
                <button type="button" onClick={onEditLesson} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"><Pencil className="size-4" /> Edit lesson</button>
                <button type="button" onClick={onCreateFolder} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"><FolderPlus className="size-4" /> Add folder</button>
                <button type="button" onClick={onBuildQuiz} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"><CheckSquare className="size-4" /> {lesson.quiz ? 'Edit test' : 'Build test'}</button>
                <button type="button" onClick={onAddMaterials} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"><Upload className="size-4" /> Add materials</button>
              </>
            ) : canTakeQuiz ? (
              <button type="button" onClick={onTakeQuiz} disabled={noTriesLeft || availabilityBlocked} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"><CheckSquare className="size-4" /> {quizActionLabel}</button>
            ) : null}
          </div>
        </div>

        {lesson.quiz ? <QuizSummaryCard lesson={lesson} /> : null}

        {hasMaterials || lesson.materialSections.length > 0 ? (
          <div className="space-y-4">
            {buckets.map(bucket => {
              const section = bucket.sectionId ? sectionMap.get(bucket.sectionId) ?? null : null
              const bucketLocked = Boolean(section?.isPaidContent) && !canManage && !canAccessPaidContents

              return (
                <div
                  key={bucket.id}
                  onDragOver={event => {
                    if (!canManage || !dragState.draggedMaterialId) return
                    event.preventDefault()
                    autoScrollWhileDragging(event)
                    onMaterialDragTargetChange(`bucket:${bucket.id}`)
                  }}
                  onDragLeave={() => {
                    if (dragState.dragTargetKey === `bucket:${bucket.id}`) {
                      onMaterialDragTargetChange(null)
                    }
                  }}
                  onDrop={event => {
                    if (!canManage || !dragState.draggedMaterialId) return
                    event.preventDefault()
                    event.stopPropagation()
                    onDropMaterial(bucket.sectionId)
                  }}
                  className={`rounded-2xl border p-4 transition ${dragState.dragTargetKey === `bucket:${bucket.id}` ? 'border-black bg-neutral-50' : 'border-neutral-200 bg-white'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 text-sm font-medium text-neutral-800">
                        <FolderOpen className="size-4" />
                        <span>{bucket.title}</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs text-neutral-500">{bucket.materials.length}</span>
                        {section?.isPaidContent ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Paid contents</span>
                        ) : null}
                      </div>
                      {bucket.description ? <p className="mt-1 text-sm text-neutral-500">{bucket.description}</p> : null}
                      {bucketLocked ? <p className="mt-2 text-sm text-amber-700">This folder is available after full course access is unlocked.</p> : null}
                    </div>
                    {canManage && section ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => onEditFolder(section)} className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
                          Edit folder
                        </button>
                        <button type="button" onClick={() => onDeleteFolder(section)} disabled={deletingSectionId === section.id} className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
                          {deletingSectionId === section.id ? 'Deleting...' : 'Delete folder'}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {bucket.materials.length > 0 ? (
                    <div className={`mt-4 grid gap-3 md:grid-cols-2 ${bucketLocked ? 'pointer-events-none select-none blur-[3px]' : ''}`}>
                      {bucket.materials.map(material => (
                        <MaterialCard
                          key={material.id}
                          material={material}
                          locked={bucketLocked}
                          canManage={canManage}
                          deleting={deletingMaterialId === material.id}
                          dragging={dragState.draggedMaterialId === material.id}
                          dropTarget={dragState.dragTargetKey === `material:${material.id}`}
                          busy={dragState.savingLayout}
                          onEdit={() => onEditMaterial(material)}
                          onDelete={() => onDeleteMaterial(material)}
                          onDragStart={() => onMaterialDragStart(material.id)}
                          onDragEnd={onMaterialDragEnd}
                          onDragOver={event => {
                            if (!canManage || !dragState.draggedMaterialId || dragState.draggedMaterialId === material.id) return
                            event.preventDefault()
                            event.stopPropagation()
                            autoScrollWhileDragging(event)
                            onMaterialDragTargetChange(`material:${material.id}`)
                          }}
                          onDrop={event => {
                            if (!canManage || !dragState.draggedMaterialId || dragState.draggedMaterialId === material.id) return
                            event.preventDefault()
                            event.stopPropagation()
                            onDropMaterial(normalizeSectionId(material.sectionId), material.id)
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-500">
                      {bucketLocked
                        ? 'This paid folder stays hidden until the learner has full course access.'
                        : canManage
                        ? 'Drop materials here or use Add materials to populate this folder.'
                        : 'No materials in this folder yet.'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : canManage ? <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-500">No materials yet. Add files, podcast audio or an embedded YouTube lesson for this topic.</div> : null}
      </div>
    </li>
  )
}

function QuizSummaryCard({ lesson }: { lesson: Lesson }) {
  if (!lesson.quiz) return null

  const typeLabels: Record<QuestionType, string> = {
    'single-choice': 'Single choice',
    'multi-select': 'Multi-select',
    'true-false': 'True / False',
    'open-answer': 'Open answer',
  }

  const isPassed = Boolean(lesson.latestAttempt?.passed)
  const cardTone = isPassed
    ? {
        shell: 'border-emerald-200 bg-emerald-50',
        heading: 'text-emerald-900',
        badge: 'border-emerald-200 bg-white text-neutral-700',
      }
    : {
        shell: 'border-amber-200 bg-amber-50',
        heading: 'text-amber-900',
        badge: 'border-amber-200 bg-white text-neutral-700',
      }

  return (
    <div className={`rounded-2xl border p-4 ${cardTone.shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`inline-flex items-center gap-2 text-sm font-medium ${cardTone.heading}`}><CheckSquare className="size-4" /> Lesson test</div>
          <h4 className="mt-1 font-semibold text-neutral-900">{lesson.quiz.title}</h4>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 ${cardTone.badge}`}>{lesson.quiz.questions.length} questions</span>
          <span className={`rounded-full border px-3 py-1 ${cardTone.badge}`}>Pass: {lesson.quiz.passingScore}%</span>
          <span className={`rounded-full border px-3 py-1 ${cardTone.badge}`}>{lesson.quiz.timeLimitMin ? `${lesson.quiz.timeLimitMin} min timer` : 'No time limit'}</span>
          <span className={`rounded-full border px-3 py-1 ${cardTone.badge}`}>{formatAttemptLimit(lesson.quiz.maxAttempts)}</span>
          <span className={`rounded-full border px-3 py-1 ${cardTone.badge}`}>{formatAvailabilityLabel(lesson.quiz)}</span>
          {lesson.quiz.attemptsUsed != null ? <span className={`rounded-full border px-3 py-1 ${cardTone.badge}`}>{formatAttemptUsage(lesson.quiz.attemptsUsed, lesson.quiz.maxAttempts)}</span> : null}
          {lesson.latestAttempt ? (
            <span className={`rounded-full border px-3 py-1 ${lesson.latestAttempt.passed ? 'border-emerald-200 bg-white text-emerald-700' : cardTone.badge}`}>
              {lesson.latestAttempt.passed ? 'Passed successfully' : `Last score: ${lesson.latestAttempt.scorePercent}%`}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from(new Set(lesson.quiz.questions.map(question => typeLabels[question.questionType]))).map(label => (
          <span key={label} className={`rounded-full border px-3 py-1 text-xs ${cardTone.badge}`}>{label}</span>
        ))}
      </div>
    </div>
  )
}

function MaterialCard({
  material,
  locked,
  canManage,
  deleting,
  dragging,
  dropTarget,
  busy,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  material: LessonMaterial
  locked: boolean
  canManage: boolean
  deleting: boolean
  dragging: boolean
  dropTarget: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}) {
  const metaIcon = material.materialKind === 'video'
    ? <Video className="size-4" />
    : material.materialKind === 'audio'
      ? <Music4 className="size-4" />
      : material.materialKind === 'youtube'
        ? <Video className="size-4" />
        : <FileText className="size-4" />
  const metaLabel = material.materialKind === 'youtube' ? 'YouTube' : material.materialKind
  const sizeLabel = material.materialKind === 'youtube' ? 'Streaming embed' : formatFileSize(material.fileSizeBytes)
  const supportingLabel = material.materialKind === 'youtube' ? (material.externalUrl ?? 'Linked from YouTube') : material.originalName
  const actionHref = material.externalUrl || material.filePath
  const actionLabel = material.materialKind === 'youtube' ? 'Open on YouTube' : 'Open file'

  return (
    <article
      draggable={canManage && !busy}
      onDragStart={() => onDragStart()}
      onDragEnd={() => onDragEnd()}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-xl border p-4 transition hover:bg-white hover:shadow-sm ${dragging ? 'cursor-grabbing opacity-60' : canManage ? 'cursor-grab' : ''} ${dropTarget ? 'border-black bg-neutral-100' : 'border-neutral-200 bg-neutral-50'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-neutral-600">{metaIcon}<span>{metaLabel}</span></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">{sizeLabel}</span>
          {canManage ? (
            <div className="flex items-center gap-1">
              <span className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-500" aria-hidden>
                <GripVertical className="size-4" />
              </span>
              <button type="button" onClick={onEdit} className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-600 hover:bg-neutral-100" aria-label="Edit material">
                <Pencil className="size-4" />
              </button>
              <button type="button" onClick={onDelete} disabled={deleting} className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50" aria-label="Delete material">
                <Trash2 className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 break-words font-medium text-neutral-900">{material.title}</div>
      <div className="mt-1 break-words text-sm text-neutral-500">{supportingLabel}</div>
      {material.description ? <div className="mt-3 break-words text-sm leading-6 text-neutral-700">{material.description}</div> : null}

      {locked ? (
        <div className="mt-4 grid min-h-40 place-items-center rounded-[22px] border border-dashed border-amber-200 bg-amber-50/70 px-4 text-center text-sm text-amber-800">
          <div className="space-y-2">
            <div className="mx-auto grid size-10 place-items-center rounded-full border border-amber-300 bg-white text-amber-700">
              <Lock className="size-4" />
            </div>
            <p className="font-medium text-amber-900">Paid contents</p>
            <p>This file is blurred until full course access is unlocked.</p>
          </div>
        </div>
      ) : material.materialKind === 'video' ? (
        <div className="mt-4 overflow-hidden rounded-[22px] border border-neutral-200 bg-[linear-gradient(180deg,#18181b_0%,#09090b_100%)] shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-sm text-white/80">
            <span className="inline-flex items-center gap-2 font-medium text-white">
              <Video className="size-4" />
              Hosted lesson video
            </span>
            {formatVideoDurationLabel(material.videoDurationSeconds) ? (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white">
                {formatVideoDurationLabel(material.videoDurationSeconds)}
              </span>
            ) : null}
          </div>
          <video controls preload="metadata" className="aspect-video w-full bg-black object-contain" src={material.filePath} />
        </div>
      ) : material.materialKind === 'audio' ? (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-3 py-3">
          <audio controls preload="metadata" className="w-full" src={material.filePath} />
        </div>
      ) : material.materialKind === 'youtube' ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-black">
          <iframe
            src={material.filePath}
            title={material.title}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-neutral-300 bg-white text-sm text-neutral-500">
          Downloadable document
        </div>
      )}

      <div className="mt-4">
        {locked || !actionHref ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-400">
            Locked
            <Lock className="size-4" />
          </span>
        ) : (
          <a href={actionHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
            {actionLabel}
            <SquareArrowOutUpRight className="size-4" />
          </a>
        )}
      </div>
    </article>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}



























