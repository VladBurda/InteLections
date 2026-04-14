import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, CalendarDays, Copy, ExternalLink, Filter, KeyRound, MapPin, Search, Sparkles, Users } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  assignCourseToLearningGroup,
  getClassDetail,
  getTeacherCourseStats,
  inviteUserToLearningGroup,
  type ClassDetail,
  type TeacherCourseStats,
} from '../lib/api'
import { usePersistentPageScroll } from '../hooks/usePersistentPageScroll'

export default function ClassDetailPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<ClassDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'Needs first attempt' | 'Needs attention' | 'On track' | 'Strong progress'>('all')
  const [assigningCourse, setAssigningCourse] = useState(false)
  const [assignCourseError, setAssignCourseError] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignCourseId, setAssignCourseId] = useState('')
  const [assignCadenceLabel, setAssignCadenceLabel] = useState('')
  const [assignDueLabel, setAssignDueLabel] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [invitingUser, setInvitingUser] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')
  const [activeCourseStats, setActiveCourseStats] = useState<TeacherCourseStats | null>(null)
  const detailRef = useRef<ClassDetail | null>(null)
  const pendingScrollRestoreRef = useRef<number | null>(null)
  const { rememberScroll, restoreScroll } = usePersistentPageScroll('class-detail')

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  const loadDetail = useCallback(async (options: { preserveScroll?: boolean } = {}) => {
    if (!classId) return
    const preserveScroll = options.preserveScroll ?? false
    const shouldRestoreSavedScroll = !detailRef.current

    if (preserveScroll && detailRef.current) {
      pendingScrollRestoreRef.current = window.scrollY
      rememberScroll()
    } else if (!detailRef.current) {
      setLoading(true)
    }

    setError('')
    try {
      const payload = await getClassDetail(classId)
      setDetail(payload)
      if (preserveScroll && pendingScrollRestoreRef.current != null) {
        const nextScroll = pendingScrollRestoreRef.current
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: nextScroll, behavior: 'auto' })
          rememberScroll()
        })
      } else if (shouldRestoreSavedScroll) {
        window.requestAnimationFrame(() => {
          restoreScroll()
        })
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load class details')
    } finally {
      pendingScrollRestoreRef.current = null
      setLoading(false)
    }
  }, [classId, rememberScroll, restoreScroll])

  useEffect(() => {
    restoreScroll()
    void loadDetail()
  }, [loadDetail, restoreScroll])

  useEffect(() => {
    if (!copyMessage) return
    const timeout = window.setTimeout(() => setCopyMessage(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [copyMessage])
  const teacherDetail = detail?.audience === 'teacher' ? detail : null

  const filteredParticipants = useMemo(() => {
    const items = teacherDetail?.participants ?? []
    return items.filter(participant => {
      const matchesSearch = !search.trim() || `${participant.name} ${participant.email}`.toLowerCase().includes(search.trim().toLowerCase())
      const matchesStatus = statusFilter === 'all' || participant.statusLabel === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [teacherDetail?.participants, search, statusFilter])

  const availableAssignableCourses = useMemo(() => {
    if (!teacherDetail) return []
    const assignedIds = new Set(teacherDetail.courses.map(course => course.id))
    return teacherDetail.availableCourses.filter(course => !assignedIds.has(course.id))
  }, [teacherDetail])

  async function onAssignCourseSubmit() {
    if (!classId) return
    if (!assignCourseId) {
      setAssignCourseError('Choose one of your courses first.')
      return
    }

    setAssignCourseError('')
    setAssigningCourse(true)
    try {
      await assignCourseToLearningGroup(classId, {
        courseId: assignCourseId,
        cadenceLabel: assignCadenceLabel.trim(),
        dueLabel: assignDueLabel.trim(),
      })
      setShowAssignModal(false)
      setAssignCourseId('')
      setAssignCadenceLabel('')
      setAssignDueLabel('')
      await loadDetail({ preserveScroll: true })
    } catch (nextError) {
      setAssignCourseError(nextError instanceof Error ? nextError.message : 'Could not assign the course')
    } finally {
      setAssigningCourse(false)
    }
  }

  async function onInviteSubmit() {
    if (!classId) return
    if (!inviteEmail.trim()) {
      setInviteError('Enter the email of an existing InteLections user.')
      return
    }

    setInviteError('')
    setInvitingUser(true)
    try {
      await inviteUserToLearningGroup(classId, { email: inviteEmail.trim() })
      setShowInviteModal(false)
      setInviteEmail('')
      await loadDetail({ preserveScroll: true })
    } catch (nextError) {
      setInviteError(nextError instanceof Error ? nextError.message : 'Could not send the class invite')
    } finally {
      setInvitingUser(false)
    }
  }

  async function onOpenCourseStats(courseId: string) {
    setShowStatsModal(true)
    setStatsLoading(true)
    setStatsError('')
    setActiveCourseStats(null)
    try {
      const payload = await getTeacherCourseStats(courseId)
      setActiveCourseStats(payload)
    } catch (nextError) {
      setStatsError(nextError instanceof Error ? nextError.message : 'Could not load course statistics')
    } finally {
      setStatsLoading(false)
    }
  }

  async function onCopyInviteCode() {
    if (!teacherDetail?.classroom.inviteCode) return
    try {
      await navigator.clipboard.writeText(teacherDetail.classroom.inviteCode)
      setCopyMessage('Invite code copied')
    } catch {
      setCopyMessage('Copy failed')
    }
  }

  if (loading && !detail) return <p className="text-sm text-neutral-600">Loading class details...</p>

  if (!detail) {
    return (
      <section className="space-y-4">
        <button type="button" onClick={() => navigate('/groups-classes')} className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="size-4" /> Back to Groups & Classes
        </button>
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error || 'Class not found.'}</div>
      </section>
    )
  }

  if (detail.audience === 'student') {
    const classroom = detail.classroom
    return (
      <section className="space-y-6">
        <button type="button" onClick={() => navigate('/groups-classes')} className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="size-4" /> Back to Groups & Classes
        </button>

        {error ? <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
          <section className="rounded-[32px] border border-neutral-200 bg-[linear-gradient(135deg,_rgba(247,243,233,0.9),_rgba(255,255,255,1)_55%,_rgba(234,241,236,0.88))] p-6 shadow-sm shadow-black/5">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">{classroom.focusArea || 'Classroom'}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{classroom.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-700">{classroom.description || 'This class brings together your assigned courses, schedules, and recent attempts in one place.'}</p>

            <div className="mt-5 grid gap-3 text-sm text-neutral-700 md:grid-cols-3">
              <InfoLine icon={<CalendarDays className="size-4" />} text={classroom.meetingLabel || 'Schedule to be announced'} />
              <InfoLine icon={<MapPin className="size-4" />} text={classroom.locationLabel || 'Location to be announced'} />
              <InfoLine icon={<Users className="size-4" />} text={classroom.assignedCoursesCount + ' assigned course' + (classroom.assignedCoursesCount === 1 ? '' : 's')} />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Teacher" value={classroom.teacherName} />
              <MiniMetric label="Assigned" value={String(classroom.assignedCoursesCount)} />
              <MiniMetric label="Joined" value={String(classroom.activeEnrollmentsCount)} />
              <MiniMetric label="Recent attempts" value={String(detail.recentAttempts.length)} />
            </div>
          </section>

          <aside className="space-y-4 rounded-[32px] border border-neutral-200 bg-white p-6 shadow-sm shadow-black/5">
            <SectionHeading
              icon={<Users className="size-5" />}
              title="Class access"
              subtitle="A quick read on why this class is open for you and what you can do next."
            />
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(236,244,255,0.82))] p-4 text-sm text-neutral-600">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-sky-800">Access through class</span>
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">Student workspace</span>
              </div>
              <p className="mt-4 leading-6">Your membership in this class unlocks the assigned courses below, keeps the room link available, and brings your recent quiz work into one calm overview.</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">What you can do here</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-700">Open class courses, continue from recent attempts, and stay aligned with the teacher's meeting rhythm.</p>
                </div>
                {classroom.teacherId ? (
                  <div className="rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Teacher</p>
                    {classroom.teacherProfileBlocked ? (
                      <div className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-neutral-900">
                        {classroom.teacherName}
                      </div>
                    ) : (
                      <Link to={`/profile/${classroom.teacherId}`} className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-neutral-900 underline-offset-4 hover:underline">
                        {classroom.teacherName}
                        <ArrowRight className="size-4" />
                      </Link>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {classroom.roomLink ? (
              <a href={classroom.roomLink} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center rounded-full border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,1),_rgba(247,243,233,0.72))] px-4 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                Open room <ExternalLink className="ml-2 size-4" />
              </a>
            ) : null}
          </aside>        </div>

        <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm shadow-black/5">
          <SectionHeading
            icon={<BookOpen className="size-5" />}
            title="Assigned courses"
            subtitle="Everything attached to this class, with your current access and progress."
          />
          <div className="mt-5 space-y-3">
            {detail.courses.map(course => (
              <StudentCourseRow key={course.id} course={{ ...course, authorName: classroom.teacherName, groupNames: [classroom.name] }} />
            ))}
            {detail.courses.length === 0 ? <EmptyCard title="No courses assigned" text="This class is ready for assigned tracks. They will appear here as soon as the teacher adds the first course." compact /> : null}
          </div>
        </section>

        <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm shadow-black/5">
          <SectionHeading
            icon={<BarChart3 className="size-5" />}
            title="Recent attempts"
            subtitle="Your latest submitted quizzes inside this class."
          />
          <div className="mt-5 space-y-3">
            {detail.recentAttempts.map(attempt => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
            {detail.recentAttempts.length === 0 ? <EmptyCard title="No recent attempts" text="Once you submit quizzes from this class, your latest results will appear here for a quick catch-up." compact /> : null}
          </div>
        </section>
      </section>
    )
  }

  const classroom = detail.classroom

  return (
    <section className="space-y-6">
      <button type="button" onClick={() => navigate('/groups-classes')} className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
        <ArrowLeft className="size-4" /> Back to Groups & Classes
      </button>

      {error ? <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <section className="rounded-[32px] border border-neutral-200 bg-[linear-gradient(135deg,_rgba(247,243,233,0.9),_rgba(255,255,255,1)_55%,_rgba(234,241,236,0.88))] p-6 shadow-sm shadow-black/5">
          <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">{classroom.focusArea || 'Classroom'}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{classroom.name}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-700">{classroom.description || 'This class is ready for teacher-led coordination, assignments, and participant progress tracking.'}</p>

          <div className="mt-5 grid gap-3 text-sm text-neutral-700 md:grid-cols-3">
            <InfoLine icon={<CalendarDays className="size-4" />} text={classroom.meetingLabel || 'Schedule to be announced'} />
            <InfoLine icon={<MapPin className="size-4" />} text={classroom.locationLabel || 'Location to be announced'} />
            <InfoLine icon={<KeyRound className="size-4" />} text={`Invite code: ${classroom.inviteCode || 'Not set yet'}`} />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Students" value={String(classroom.studentsCount)} />
            <MiniMetric label="Assigned tracks" value={String(classroom.assignedCoursesCount)} />
            <MiniMetric label="Quiz average" value={classroom.avgQuizScore == null ? 'No attempts' : `${classroom.avgQuizScore}%`} />
            <MiniMetric label="Pending invites" value={String(classroom.pendingInvitesCount)} />
          </div>
        </section>

        <aside className="space-y-4 rounded-[32px] border border-neutral-200 bg-white p-6 shadow-sm shadow-black/5">
          <SectionHeading
            icon={<BarChart3 className="size-5" />}
            title="Quick actions"
            subtitle="Everything you usually need while running one class, without going back to the full dashboard."
          />
          <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(247,243,233,0.7))] p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Teacher workspace</span>
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-800">Class in progress</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setShowAssignModal(true)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-4 text-left text-sm font-medium text-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50">
                <span className="block">Assign course</span>
                <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500">Connect one of your tracks to this class plan.</span>
              </button>
              <button type="button" onClick={() => setShowInviteModal(true)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-4 text-left text-sm font-medium text-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50">
                <span className="block">Invite learner</span>
                <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500">Send a classroom invitation to an existing user.</span>
              </button>
              <button type="button" onClick={() => void onCopyInviteCode()} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-4 text-left text-sm font-medium text-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50">
                <span className="inline-flex items-center gap-2">
                  <Copy className="size-4" />
                  Copy invite code
                </span>
                <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500">Share a quick join code with your students.</span>
              </button>
              {classroom.roomLink ? (
                <a href={classroom.roomLink} target="_blank" rel="noreferrer" className="rounded-[22px] border border-neutral-200 bg-white px-4 py-4 text-left text-sm font-medium text-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-50">
                  <span className="inline-flex items-center gap-2">
                    Open room
                    <ExternalLink className="size-4" />
                  </span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-neutral-500">Jump straight into the live classroom space.</span>
                </a>
              ) : null}
            </div>
          </div>
          {copyMessage ? <p className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">{copyMessage}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Plan headroom</p>
              <p className="mt-3 font-medium text-neutral-900">Assignments used: {detail.limits.assignmentsUsed} / {detail.limits.assignmentsLimit}</p>
              <p className="mt-2">Classes used: {detail.limits.classesUsed} / {detail.limits.classesLimit ?? 'Unlimited'}</p>
            </div>
            <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Class pulse</p>
              <p className="mt-3 font-medium text-neutral-900">{classroom.pendingInvitesCount} pending invite{classroom.pendingInvitesCount === 1 ? '' : 's'}</p>
              <p className="mt-2">{classroom.lastActivity ? `Last class activity: ${formatDateLabel(classroom.lastActivity)}` : 'No class activity yet'}</p>
            </div>
          </div>
          <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.72))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Pending invites</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">A quick view of learners who still need to accept their classroom invitation.</p>
              </div>
              <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                {detail.pendingInvites.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {detail.pendingInvites.map(invite => (
                <div key={invite.id} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-neutral-900">{invite.recipientEmail}</p>
                      <p className="mt-1 text-neutral-500">Sent {formatDateLabel(invite.createdAt)}</p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-800">Pending</span>
                  </div>
                </div>
              ))}
              {detail.pendingInvites.length === 0 ? <EmptyCard title="No pending invites" text="Everything is nicely caught up here. New classroom invitations will appear in this panel." compact /> : null}
            </div>
          </div>
        </aside>
      </div>

      <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm shadow-black/5">
        <SectionHeading
          icon={<BookOpen className="size-5" />}
          title="Assigned courses"
          subtitle="Class-specific tracks with quick read metrics and one-click access to deeper course statistics."
        />
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {detail.courses.map(course => (
            <article key={course.id} className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/course/${course.id}`} className="text-lg font-semibold text-neutral-900 underline-offset-4 hover:underline">{course.title}</Link>
                  <p className="mt-1 text-sm text-neutral-600">{course.category} / {formatLevel(course.level)}</p>
                  <p className="mt-1 text-sm text-neutral-500">{course.cadenceLabel || 'Flexible cadence'} / {course.dueLabel || 'No due note yet'}</p>
                </div>
                <button type="button" onClick={() => void onOpenCourseStats(course.id)} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                  View stats
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniMetric label="Lessons" value={String(course.lessonCount)} />
                <MiniMetric label="Tests" value={String(course.quizCount)} />
                <MiniMetric label="Participants" value={String(course.participantCount)} />
                <MiniMetric label="Enrolled" value={String(course.enrolledCount)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-neutral-600">
                <span>Average: {course.avgQuizScore == null ? 'No attempts' : `${course.avgQuizScore}%`}</span>
                <span>Last activity: {course.lastActivity ? formatDateLabel(course.lastActivity) : 'Waiting'}</span>
              </div>
            </article>
          ))}
          {detail.courses.length === 0 ? <EmptyCard title="No courses assigned" text="This class does not have a learning track yet. Use Assign course to start shaping the classroom plan." /> : null}
        </div>
      </section>

      <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            icon={<Users className="size-5" />}
            title="Students"
            subtitle="Full student roster with filters, progress indicators, and direct profile access."
          />
          <div className="flex flex-wrap gap-3">
            <label className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or email" className="w-full rounded-full border border-neutral-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-neutral-400" />
            </label>
            <label className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
              <Filter className="size-4 text-neutral-400" />
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="bg-transparent outline-none">
                <option value="all">All statuses</option>
                <option value="Needs first attempt">Needs first attempt</option>
                <option value="Needs attention">Needs attention</option>
                <option value="On track">On track</option>
                <option value="Strong progress">Strong progress</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {filteredParticipants.map(participant => (
            <article key={participant.id} className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <AvatarBubble name={participant.name} avatarUrl={participant.avatarUrl} />
                    <div className="min-w-0">
                      {participant.profileBlocked ? (
                        <span className="block truncate font-semibold text-neutral-900">{participant.name}</span>
                      ) : (
                        <Link to={`/profile/${participant.id}`} className="block truncate font-semibold text-neutral-900 underline-offset-4 hover:underline">{participant.name}</Link>
                      )}
                      <p className="truncate text-sm text-neutral-500">{participant.email}</p>
                    </div>
                  </div>
                </div>
                <StatusPill label={participant.statusLabel} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <MiniMetric label="Assigned" value={String(participant.assignedCoursesCount)} />
                <MiniMetric label="Enrolled" value={String(participant.enrolledCoursesCount)} />
                <MiniMetric label="Avg. score" value={participant.avgQuizScore == null ? 'No attempts' : `${participant.avgQuizScore}%`} />
                <MiniMetric label="Attempts" value={String(participant.attemptsCount)} />
                <MiniMetric label="Passed tests" value={String(participant.passedQuizzesCount)} />
                <MiniMetric label="Joined" value={participant.joinedAt ? formatDateLabel(participant.joinedAt) : 'Recently'} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
                <span>Last activity: {participant.lastActivity ? formatDateLabel(participant.lastActivity) : 'Waiting'}</span>
                {participant.profileBlocked ? null : (
                  <Link to={`/profile/${participant.id}`} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                    Open profile <ArrowRight className="size-4" />
                  </Link>
                )}
              </div>
            </article>
          ))}
          {filteredParticipants.length === 0 ? <EmptyCard title="No learners matched" text="Nothing matches the current filters right now. Try widening the search or switching the progress view." /> : null}
        </div>
      </section>

      {showAssignModal ? (
        <ModalShell title="Assign course" subtitle="Shape the classroom track by connecting one of your courses and setting the rhythm students should follow." onClose={() => { setShowAssignModal(false); setAssignCourseError('') }}>
          <div className="space-y-5">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(247,243,233,0.74))] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Teacher workspace</span>
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-800">Class planning</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-600">Choose a course, optionally add a cadence note, and give students a soft deadline cue they will see in the class flow.</p>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-neutral-700">Course</span>
              <select value={assignCourseId} onChange={event => setAssignCourseId(event.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400">
                <option value="">Choose one of your courses</option>
                {availableAssignableCourses.map(course => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-neutral-700">Cadence label</span>
                <input value={assignCadenceLabel} onChange={event => setAssignCadenceLabel(event.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="e.g. One lesson per week" />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-neutral-700">Due note</span>
                <input value={assignDueLabel} onChange={event => setAssignDueLabel(event.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="e.g. Notes before Wednesday" />
              </label>
            </div>
            {assignCourseError ? <InlineMessage tone="error" text={assignCourseError} /> : null}
            {availableAssignableCourses.length === 0 ? <InlineMessage tone="neutral" text="All of your current courses are already assigned to this class." /> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAssignModal(false)} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button type="button" onClick={() => void onAssignCourseSubmit()} disabled={assigningCourse || availableAssignableCourses.length === 0} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">{assigningCourse ? 'Assigning...' : 'Assign course'}</button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showInviteModal ? (
        <ModalShell title="Invite learner" subtitle="Send a classroom invitation to an existing InteLections user and let them join this workspace with one acceptance." onClose={() => { setShowInviteModal(false); setInviteError('') }}>
          <div className="space-y-5">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(236,244,255,0.82))] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Classroom invites</span>
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-800">Pending until accepted</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-600">Use the learner’s account email. Once the invite is sent, it will appear in their top-right inbox until they accept or dismiss it.</p>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-neutral-700">Learner email</span>
              <input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="student@example.com" />
            </label>
            {inviteError ? <InlineMessage tone="error" text={inviteError} /> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInviteModal(false)} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button type="button" onClick={() => void onInviteSubmit()} disabled={invitingUser} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">{invitingUser ? 'Sending...' : 'Send invite'}</button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showStatsModal ? (
        <ModalShell title={activeCourseStats ? `Course stats - ${activeCourseStats.course.title}` : 'Course stats'} subtitle="A class-friendly overview of how this course is performing, from broad participation down to quiz-level movement." onClose={() => { setShowStatsModal(false); setActiveCourseStats(null); setStatsError('') }} wide>
          <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
            {statsLoading ? <InlineMessage tone="neutral" text="Loading statistics..." /> : null}
            {statsError ? <InlineMessage tone="error" text={statsError} /> : null}
            {activeCourseStats ? (
              <>
                <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(247,243,233,0.74))] p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Teacher analytics</span>
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-800">Live course pulse</span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-neutral-600">Use this view to quickly spot participation, average performance, and where students may need more structure or support.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <MiniMetric label="Participants" value={String(activeCourseStats.course.participantCount)} />
                  <MiniMetric label="Attempts" value={String(activeCourseStats.course.attemptsCount)} />
                  <MiniMetric label="Avg. score" value={activeCourseStats.course.avgQuizScore == null ? 'No attempts' : `${activeCourseStats.course.avgQuizScore}%`} />
                  <MiniMetric label="Assigned groups" value={String(activeCourseStats.course.assignedGroupsCount)} />
                </div>
                <div className="space-y-3">
                  {activeCourseStats.quizzes.map(quiz => (
                    <article key={quiz.id} className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(246,243,235,0.76))] p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-neutral-900">{quiz.title}</p>
                          <p className="mt-1 text-sm text-neutral-500">{quiz.lessonTitle}</p>
                        </div>
                        <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700">{quiz.participantCount} participants</span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <MiniMetric label="Attempts" value={String(quiz.attemptsCount)} />
                        <MiniMetric label="Pass rate" value={quiz.passRate == null ? 'No attempts' : `${quiz.passRate}%`} />
                        <MiniMetric label="Avg. score" value={quiz.avgScore == null ? 'No attempts' : `${quiz.avgScore}%`} />
                        <MiniMetric label="Last activity" value={quiz.lastActivity ? formatDateLabel(quiz.lastActivity) : 'Waiting'} />
                      </div>
                    </article>
                  ))}
                  {activeCourseStats.quizzes.length === 0 ? <EmptyCard title="No tests yet" text="Quiz-level statistics will appear here once this course has at least one test." compact /> : null}
                </div>
              </>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </section>
  )
}

function ModalShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className={[
        `w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} rounded-[30px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(252,250,246,0.98))] p-5 shadow-2xl shadow-black/10`,
        'transition-all duration-500 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      ].join(' ')}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-neutral-700">
              <span className="grid size-10 place-items-center rounded-full bg-neutral-100">
                <Sparkles className="size-4" />
              </span>
              <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
            </div>
            {subtitle ? <p className="max-w-2xl text-sm leading-6 text-neutral-600">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function InlineMessage({ tone, text }: { tone: 'neutral' | 'error'; text: string }) {
  const className = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-neutral-200 bg-neutral-50 text-neutral-600'

  return (
    <div className={`rounded-[20px] border px-4 py-3 text-sm ${className}`}>
      {text}
    </div>
  )
}

function SectionHeading({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 text-neutral-700">
        <span className="grid size-10 place-items-center rounded-full bg-neutral-100">{icon}</span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-neutral-600">{subtitle}</p>
    </div>
  )
}

function InfoLine({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-700">
      <span className="text-neutral-500">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-neutral-800">{value}</p>
    </div>
  )
}

function AvatarBubble({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="size-10 rounded-full object-cover" />
  }

  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('')
  return <span className="grid size-10 place-items-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-700">{initials || 'U'}</span>
}

function StatusPill({ label }: { label: string }) {
  const className = label === 'Strong progress'
    ? 'bg-emerald-100 text-emerald-800'
    : label === 'On track'
      ? 'bg-sky-100 text-sky-800'
      : label === 'Needs attention'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-neutral-200 text-neutral-700'

  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${className}`}>{label}</span>
}

function StudentCourseRow({ course }: { course: { id: string; title: string; category: string; level: string; accessMode?: string; avgQuizScore: number | null; lastAttemptAt: string; isEnrolled: boolean; authorName: string; groupNames: string[] } }) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{course.category} / {formatLevel(course.level)}</p>
          <h3 className="mt-2 text-lg font-semibold text-neutral-900">{course.title}</h3>
          <p className="mt-1 text-sm text-neutral-600">by {course.authorName}</p>
        </div>
        <span className={[
          'rounded-full px-3 py-1 text-sm font-medium',
          course.isEnrolled ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700',
        ].join(' ')}>
          {course.isEnrolled ? 'Joined' : 'Assigned'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {course.groupNames.map(groupName => (
          <span key={groupName} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
            {groupName}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniMetric label="Access" value={course.accessMode === 'class-only' ? 'Class only' : course.accessMode === 'public-paid' ? 'Paid' : 'Free'} />
        <MiniMetric label="Quiz average" value={course.avgQuizScore == null ? 'No attempts' : String(course.avgQuizScore) + '%'} />
        <MiniMetric label="Last attempt" value={course.lastAttemptAt ? formatDateLabel(course.lastAttemptAt) : 'Waiting'} />
        <MiniMetric label="Status" value={course.isEnrolled ? 'Ready' : 'Assigned'} />
      </div>

      <div className="mt-4">
        <Link to={`/course/${course.id}`} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
          Open course
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  )
}

function AttemptRow({ attempt }: { attempt: { id: string; courseTitle: string; quizTitle: string; scorePercent: number; passed: boolean; submittedAt: string } }) {
  return (
    <article className="rounded-[24px] border border-neutral-200 bg-neutral-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">{attempt.quizTitle}</p>
          <p className="text-sm text-neutral-500">{attempt.courseTitle}</p>
        </div>
        <span className={[
          'rounded-full px-3 py-1 text-sm font-medium',
          attempt.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
        ].join(' ')}>
          {attempt.scorePercent}%
        </span>
      </div>
      <p className="mt-3 text-sm text-neutral-600">Submitted {formatDateLabel(attempt.submittedAt)} / {attempt.passed ? 'Passed' : 'Retry recommended'}</p>
    </article>
  )
}
function EmptyCard({ title = 'Nothing here yet', text, compact = false }: { title?: string; text: string; compact?: boolean }) {
  return (
    <div className={[
      'rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(246,243,235,0.72))] text-center text-neutral-500 shadow-sm',
      compact ? 'px-4 py-8' : 'px-5 py-14',
    ].join(' ')}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        <span className="grid size-11 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm">
          <Sparkles className="size-4" />
        </span>
        <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-neutral-400">{title}</p>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{text}</p>
      </div>
    </div>
  )
}

function formatLevel(value: string) {
  if (!value) return 'Level not set'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateLabel(value: string) {
  if (!value) return 'Waiting'
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}








