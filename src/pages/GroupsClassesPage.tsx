import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Lock,
  MapPin,
  PencilLine,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  assignCourseToLearningGroup,
  createLearningGroup,
  getTeacherCourseStats,
  getGroupsClassesDashboard,
  inviteUserToLearningGroup,
  joinLearningGroupByInviteCode,
  updateLearningGroup,
  type TeacherCourseStats,
  type TeacherLimits,
  type GroupsClassesDashboard,
  type GroupsOverviewMetric,
  type StudentAssignedCourse,
  type StudentClassroom,
  type StudentRecentAttempt,
  type TeacherClassroom,
  type TeacherParticipant,
  updateMyRole,
} from '../lib/api'
import { usePersistentPageScroll } from '../hooks/usePersistentPageScroll'

type ClassFormDraft = {
  name: string
  description: string
  focusArea: string
  meetingLabel: string
  locationLabel: string
  roomLink: string
}

const EMPTY_CLASS_FORM: ClassFormDraft = {
  name: '',
  description: '',
  focusArea: '',
  meetingLabel: '',
  locationLabel: '',
  roomLink: '',
}

function toClassFormDraft(classroom?: Pick<TeacherClassroom, 'name' | 'description' | 'focusArea' | 'meetingLabel' | 'locationLabel' | 'roomLink'>): ClassFormDraft {
  return {
    name: classroom?.name ?? '',
    description: classroom?.description ?? '',
    focusArea: classroom?.focusArea ?? '',
    meetingLabel: classroom?.meetingLabel ?? '',
    locationLabel: classroom?.locationLabel ?? '',
    roomLink: classroom?.roomLink ?? '',
  }
}

export default function GroupsClassesPage() {
  const [dashboard, setDashboard] = useState<GroupsClassesDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [switchingRole, setSwitchingRole] = useState<GroupsClassesDashboard['viewer']['role'] | null>(null)
  const [roleError, setRoleError] = useState('')
  const [showCreateClass, setShowCreateClass] = useState(false)
  const [creatingClass, setCreatingClass] = useState(false)
  const [createClassError, setCreateClassError] = useState('')
  const [showEditClass, setShowEditClass] = useState(false)
  const [editingClassId, setEditingClassId] = useState('')
  const [editingClassForm, setEditingClassForm] = useState<ClassFormDraft>(EMPTY_CLASS_FORM)
  const [savingClassEdit, setSavingClassEdit] = useState(false)
  const [editClassError, setEditClassError] = useState('')
  const [showAssignCourse, setShowAssignCourse] = useState(false)
  const [assigningCourse, setAssigningCourse] = useState(false)
  const [assignCourseError, setAssignCourseError] = useState('')
  const [assignClassId, setAssignClassId] = useState('')
  const [assignCourseId, setAssignCourseId] = useState('')
  const [assignCadenceLabel, setAssignCadenceLabel] = useState('')
  const [assignDueLabel, setAssignDueLabel] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteClassId, setInviteClassId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [invitingUser, setInvitingUser] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [courseStatsLoading, setCourseStatsLoading] = useState(false)
  const [courseStatsError, setCourseStatsError] = useState('')
  const [activeCourseStats, setActiveCourseStats] = useState<TeacherCourseStats | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinCodeError, setJoinCodeError] = useState('')
  const [joinCodeSuccess, setJoinCodeSuccess] = useState('')
  const [joiningByCode, setJoiningByCode] = useState(false)
  const [className, setClassName] = useState('')
  const [classDescription, setClassDescription] = useState('')
  const [classFocusArea, setClassFocusArea] = useState('')
  const [classMeetingLabel, setClassMeetingLabel] = useState('')
  const [classLocationLabel, setClassLocationLabel] = useState('')
  const [classRoomLink, setClassRoomLink] = useState('')
  const dashboardRef = useRef<GroupsClassesDashboard | null>(null)
  const pendingScrollRestoreRef = useRef<number | null>(null)
  const { rememberScroll, restoreScroll } = usePersistentPageScroll('groups-classes')

  const teacherClassrooms = dashboard?.teacher?.classrooms ?? []
  const availableCourses = dashboard?.teacher?.availableCourses ?? []
  const teacherLimits = dashboard?.teacher?.limits ?? { assignmentsUsed: 0, assignmentsLimit: 0, classesUsed: 0, classesLimit: null }
  const selectedAssignClass = teacherClassrooms.find(item => item.id === assignClassId) ?? null
  const selectedInviteClass = teacherClassrooms.find(item => item.id === inviteClassId) ?? null

  useEffect(() => {
    dashboardRef.current = dashboard
  }, [dashboard])

  const loadDashboard = useCallback(async (options: { preserveScroll?: boolean } = {}) => {
    const preserveScroll = options.preserveScroll ?? false
    const shouldRestoreSavedScroll = !dashboardRef.current

    if (preserveScroll && dashboardRef.current) {
      pendingScrollRestoreRef.current = window.scrollY
      rememberScroll()
      setRefreshing(true)
    } else if (!dashboardRef.current) {
      setLoading(true)
    }

    setError('')
    try {
      const payload = await getGroupsClassesDashboard()
      setDashboard(payload)
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
      setError(nextError instanceof Error ? nextError.message : 'Could not load Groups & Classes')
    } finally {
      pendingScrollRestoreRef.current = null
      setLoading(false)
      setRefreshing(false)
    }
  }, [rememberScroll, restoreScroll])

  useEffect(() => {
    restoreScroll()
    void loadDashboard()
  }, [loadDashboard, restoreScroll])

  const intro = useMemo(() => {
    if (!dashboard) return ''
    if (dashboard.audience === 'teacher') {
      return 'Run classes, track participant momentum, and keep course assignments organized in one place.'
    }
    if (dashboard.audience === 'student') {
      return 'See your current classes, assigned courses, and quiz momentum without hopping across pages.'
    }
    return 'Personal mode keeps this page simple. Switch to Student or Teacher when you want classroom tools.'
  }, [dashboard])

  async function onSwitchRole(nextRole: GroupsClassesDashboard['viewer']['role']) {
    if (!dashboard || dashboard.viewer.role === nextRole || nextRole === 'Admin') return

    if (nextRole === 'Teacher' && dashboard.viewer.role !== 'Teacher') {
      const confirmed = window.confirm('Switch to Teacher mode? This unlocks classroom management and teaching-focused views.')
      if (!confirmed) return
    }

    setSwitchingRole(nextRole)
    setRoleError('')
    try {
      await updateMyRole(nextRole)
      window.dispatchEvent(new Event('intelections-auth-refresh'))
      await loadDashboard()
    } catch (nextError) {
      setRoleError(nextError instanceof Error ? nextError.message : 'Could not switch role')
    } finally {
      setSwitchingRole(null)
    }
  }

  function closeCreateClassModal() {
    setShowCreateClass(false)
    setCreateClassError('')
    setClassName('')
    setClassDescription('')
    setClassFocusArea('')
    setClassMeetingLabel('')
    setClassLocationLabel('')
    setClassRoomLink('')
  }

  function openEditClassModal(classroom: TeacherClassroom) {
    setEditingClassId(classroom.id)
    setEditingClassForm(toClassFormDraft(classroom))
    setEditClassError('')
    setShowEditClass(true)
  }

  function closeEditClassModal() {
    setShowEditClass(false)
    setEditingClassId('')
    setEditingClassForm(EMPTY_CLASS_FORM)
    setEditClassError('')
    setSavingClassEdit(false)
  }

  function openAssignCourseModal(classId: string) {
    setAssignClassId(classId)
    setAssignCourseId('')
    setAssignCadenceLabel('')
    setAssignDueLabel('')
    setAssignCourseError('')
    setShowAssignCourse(true)
  }

  function closeAssignCourseModal() {
    setShowAssignCourse(false)
    setAssigningCourse(false)
    setAssignCourseError('')
    setAssignClassId('')
    setAssignCourseId('')
    setAssignCadenceLabel('')
    setAssignDueLabel('')
  }

  async function onAssignCourseSubmit() {
    if (!assignClassId) return
    if (!assignCourseId) {
      setAssignCourseError('Choose one of your courses first.')
      return
    }

    setAssigningCourse(true)
    setAssignCourseError('')
    try {
      await assignCourseToLearningGroup(assignClassId, {
        courseId: assignCourseId,
        cadenceLabel: assignCadenceLabel.trim(),
        dueLabel: assignDueLabel.trim(),
      })
      closeAssignCourseModal()
      await loadDashboard({ preserveScroll: true })
    } catch (nextError) {
      setAssignCourseError(nextError instanceof Error ? nextError.message : 'Could not assign the course')
    } finally {
      setAssigningCourse(false)
    }
  }

  function openInviteModal(classId: string) {
    setInviteClassId(classId)
    setInviteEmail('')
    setInviteError('')
    setShowInviteModal(true)
  }

  function closeInviteModal() {
    setShowInviteModal(false)
    setInviteClassId('')
    setInviteEmail('')
    setInviteError('')
    setInvitingUser(false)
  }

  async function onInviteSubmit() {
    if (!inviteClassId) return
    if (!inviteEmail.trim()) {
      setInviteError('Enter the email of an existing InteLections user.')
      return
    }

    setInvitingUser(true)
    setInviteError('')
    try {
      await inviteUserToLearningGroup(inviteClassId, { email: inviteEmail.trim() })
      closeInviteModal()
      await loadDashboard({ preserveScroll: true })
    } catch (nextError) {
      setInviteError(nextError instanceof Error ? nextError.message : 'Could not send the class invite')
    } finally {
      setInvitingUser(false)
    }
  }

  async function openStatsModal(courseId: string) {
    setShowStatsModal(true)
    setCourseStatsLoading(true)
    setCourseStatsError('')
    setActiveCourseStats(null)
    try {
      const payload = await getTeacherCourseStats(courseId)
      setActiveCourseStats(payload)
    } catch (nextError) {
      setCourseStatsError(nextError instanceof Error ? nextError.message : 'Could not load course statistics')
    } finally {
      setCourseStatsLoading(false)
    }
  }

  function closeStatsModal() {
    setShowStatsModal(false)
    setCourseStatsLoading(false)
    setCourseStatsError('')
    setActiveCourseStats(null)
  }

  async function onJoinByCodeSubmit() {
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setJoinCodeError('Enter an invite code first.')
      return
    }

    setJoiningByCode(true)
    setJoinCodeError('')
    setJoinCodeSuccess('')
    try {
      const response = await joinLearningGroupByInviteCode(code)
      setJoinCode('')
      setJoinCodeSuccess(`You joined ${response.className}. Assigned courses are now available in your classroom hub.`)
      await loadDashboard({ preserveScroll: true })
    } catch (nextError) {
      setJoinCodeError(nextError instanceof Error ? nextError.message : 'Could not join the class')
    } finally {
      setJoiningByCode(false)
    }
  }

  async function onCreateClassSubmit() {
    const name = className.trim()
    if (!name) {
      setCreateClassError('Class name is required.')
      return
    }

    setCreatingClass(true)
    setCreateClassError('')
    try {
      await createLearningGroup({
        name,
        description: classDescription.trim(),
        focusArea: classFocusArea.trim(),
        meetingLabel: classMeetingLabel.trim(),
        locationLabel: classLocationLabel.trim(),
        roomLink: classRoomLink.trim(),
      })
      closeCreateClassModal()
      await loadDashboard({ preserveScroll: true })
    } catch (nextError) {
      setCreateClassError(nextError instanceof Error ? nextError.message : 'Could not create class')
    } finally {
      setCreatingClass(false)
    }
  }

  async function onEditClassSubmit() {
    const name = editingClassForm.name.trim()
    if (!editingClassId) return
    if (!name) {
      setEditClassError('Class name is required.')
      return
    }

    setSavingClassEdit(true)
    setEditClassError('')
    try {
      await updateLearningGroup(editingClassId, {
        name,
        description: editingClassForm.description.trim(),
        focusArea: editingClassForm.focusArea.trim(),
        meetingLabel: editingClassForm.meetingLabel.trim(),
        locationLabel: editingClassForm.locationLabel.trim(),
        roomLink: editingClassForm.roomLink.trim(),
      })
      closeEditClassModal()
      await loadDashboard({ preserveScroll: true })
    } catch (nextError) {
      setEditClassError(nextError instanceof Error ? nextError.message : 'Could not update class')
    } finally {
      setSavingClassEdit(false)
    }
  }
  if (loading && !dashboard) {
    return <section className="min-h-[50vh] grid place-items-center text-sm text-neutral-600">Loading Groups & Classes...</section>
  }

  if (!dashboard) {
    return (
      <section className="space-y-4">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-red-700">
          Could not load Groups & Classes: {error || 'Unknown error'}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,_rgba(240,231,211,0.9),_rgba(255,255,255,0.96)_48%,_rgba(230,239,233,0.72))] p-6 md:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[260px] space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-sm text-neutral-700 shadow-sm">
              <Sparkles className="size-4" />
              {dashboard.audience === 'teacher' ? 'Teacher workspace' : dashboard.audience === 'student' ? 'Student workspace' : 'Personal workspace'}
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Groups & Classes for {dashboard.viewer.firstName}</h2>
              <p className="max-w-3xl text-[15px] leading-7 text-neutral-700">{intro}</p>
            </div>
          </div>
          <div className="min-w-[230px] rounded-[28px] border border-black/10 bg-white/85 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Role snapshot</p>
            <p className="mt-3 text-2xl font-semibold">{dashboard.viewer.role}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {dashboard.audience === 'teacher'
                ? 'Your courses can be grouped into classes, shared, and monitored from one dashboard.'
                : dashboard.audience === 'student'
                  ? 'Your class assignments and progress stay connected to your enrolled courses.'
                  : 'Use this space as a future-ready base for structured learning when you switch roles.'}
            </p>
            {dashboard.viewer.role !== 'Admin' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(['Personal', 'Student', 'Teacher'] as const).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => void onSwitchRole(role)}
                      disabled={switchingRole !== null && switchingRole !== role}
                      className={[
                        'rounded-full px-4 py-2 text-sm font-medium transition',
                        dashboard.viewer.role === role
                          ? 'border border-black bg-black text-white'
                          : 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50',
                        switchingRole !== null && switchingRole !== role ? 'cursor-not-allowed opacity-50' : '',
                      ].join(' ')}
                    >
                      {switchingRole === role ? 'Switching...' : role}
                    </button>
                  ))}
                </div>
                {roleError ? <p className="text-sm text-red-600">{roleError}</p> : null}
              </div>
            ) : null}
            </div>
          </div>
        </div>

      <div className="flex flex-wrap gap-3">
        {error ? <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div> : null}
        {refreshing ? <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">Refreshing class data...</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.overview.map(metric => (
          <Reveal key={metric.label} delay={80}>
            <OverviewCard metric={metric} />
          </Reveal>
        ))}
      </div>

      {dashboard.audience === 'teacher' && dashboard.teacher && (
        <Reveal delay={120}>
          <TeacherWorkspace
            classrooms={dashboard.teacher.classrooms}
            participants={dashboard.teacher.participants}
            limits={teacherLimits}
            onCreateClass={() => setShowCreateClass(true)}
            onAssignCourse={openAssignCourseModal}
            onEditClass={openEditClassModal}
            onInviteUser={openInviteModal}
            onOpenCourseStats={courseId => void openStatsModal(courseId)}
          />
        </Reveal>
      )}

      {dashboard.audience === 'student' && dashboard.student && (
        <Reveal delay={120}>
          <StudentWorkspace
            classrooms={dashboard.student.classrooms}
            assignedCourses={dashboard.student.assignedCourses}
            recentAttempts={dashboard.student.recentAttempts}
            joinCode={joinCode}
            joinCodeError={joinCodeError}
            joinCodeSuccess={joinCodeSuccess}
            joiningByCode={joiningByCode}
            onJoinCodeChange={setJoinCode}
            onJoinByCode={() => void onJoinByCodeSubmit()}
          />
        </Reveal>
      )}

      {dashboard.audience === 'personal' && dashboard.personal && (
        <Reveal delay={120}>
          <PersonalWorkspace
            ownedCoursesCount={dashboard.personal.ownedCoursesCount}
            savedCoursesCount={dashboard.personal.savedCoursesCount}
            message={dashboard.personal.message}
          />
        </Reveal>
      )}

      {showCreateClass ? (
        <ModalShell title="Create class" subtitle="Set up the classroom shell now and we can layer students, schedules, invites, courses, and group tests on top of it." onClose={closeCreateClassModal}>
          <div className="max-h-[76vh] space-y-5 overflow-y-auto pr-1">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(247,243,233,0.74))] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Teacher workspace</span>
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-800">New classroom</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-600">Think of this as the home base for one learning group. The structure can stay simple now and grow with assignments and tests later.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Class name</span>
                <input value={className} onChange={e => setClassName(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="e.g. Ancient Civilizations Seminar" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Description</span>
                <textarea value={classDescription} onChange={e => setClassDescription(e.target.value)} rows={3} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="What is this class for, how does it run, and who is it for?" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Focus area</span>
                <input value={classFocusArea} onChange={e => setClassFocusArea(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="History, Programming, Languages" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Meeting schedule</span>
                <input value={classMeetingLabel} onChange={e => setClassMeetingLabel(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="Wednesdays, 17:00" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Location / mode</span>
                <input value={classLocationLabel} onChange={e => setClassLocationLabel(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="Room 204 / Online / Hybrid" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Room link (optional)</span>
                <input value={classRoomLink} onChange={e => setClassRoomLink(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="https://meet.google.com/... or https://zoom.us/..." />
              </label>
            </div>

            {createClassError ? <InlineMessage tone="error" text={createClassError} /> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeCreateClassModal} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button type="button" onClick={() => void onCreateClassSubmit()} disabled={creatingClass} className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                <Plus className="size-4" />
                {creatingClass ? 'Creating...' : 'Create class'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showEditClass ? (
        <ModalShell title="Edit class" subtitle="Refine the class framing, meeting cues, and room details without losing current enrollments, invites, or assigned courses." onClose={closeEditClassModal}>
          <div className="max-h-[76vh] space-y-5 overflow-y-auto pr-1">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(247,243,233,0.74))] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Teacher workspace</span>
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-800">Editing classroom</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-600">Update the class shell without disturbing the current student roster or attached course tracks.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Class name</span>
                <input value={editingClassForm.name} onChange={e => setEditingClassForm(current => ({ ...current, name: e.target.value }))} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="e.g. Ancient Civilizations Seminar" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Description</span>
                <textarea value={editingClassForm.description} onChange={e => setEditingClassForm(current => ({ ...current, description: e.target.value }))} rows={3} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="What is this class for, how does it run, and who is it for?" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Focus area</span>
                <input value={editingClassForm.focusArea} onChange={e => setEditingClassForm(current => ({ ...current, focusArea: e.target.value }))} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="History, Programming, Languages" />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Meeting schedule</span>
                <input value={editingClassForm.meetingLabel} onChange={e => setEditingClassForm(current => ({ ...current, meetingLabel: e.target.value }))} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="Wednesdays, 17:00" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Location / mode</span>
                <input value={editingClassForm.locationLabel} onChange={e => setEditingClassForm(current => ({ ...current, locationLabel: e.target.value }))} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="Room 204 / Online / Hybrid" />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium text-neutral-700">Room link (optional)</span>
                <input value={editingClassForm.roomLink} onChange={e => setEditingClassForm(current => ({ ...current, roomLink: e.target.value }))} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="https://meet.google.com/... or https://zoom.us/..." />
              </label>
            </div>

            {editClassError ? <InlineMessage tone="error" text={editClassError} /> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeEditClassModal} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button type="button" onClick={() => void onEditClassSubmit()} disabled={savingClassEdit} className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                <PencilLine className="size-4" />
                {savingClassEdit ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showAssignCourse ? (
        <ModalShell title="Assign course to class" subtitle={selectedAssignClass ? `Choose one of your authored courses for ${selectedAssignClass.name}.` : 'Choose one of your authored courses.'} onClose={closeAssignCourseModal}>
          <div className="space-y-5">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(247,243,233,0.74))] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Course planning</span>
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-800">Class track</span>
              </div>
              <div className="mt-4 space-y-1 text-sm text-neutral-600">
                <p>Shape the class rhythm by attaching one of your authored courses and adding lightweight pacing notes for students.</p>
                <div className="pt-2 text-neutral-500">
                  {teacherLimits.assignmentsLimit > 0 ? (
                    <p>Course assignments used: {teacherLimits.assignmentsUsed} / {teacherLimits.assignmentsLimit}</p>
                  ) : null}
                  <p>Classes used: {teacherLimits.classesUsed} / {teacherLimits.classesLimit ?? 'Unlimited'}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Your course</span>
                <select value={assignCourseId} onChange={e => setAssignCourseId(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400">
                  <option value="">Select a course</option>
                  {availableCourses.map(course => (
                    <option key={course.id} value={course.id}>
                      {course.title} - {course.category} / {formatLevel(course.level)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Cadence label</span>
                <input value={assignCadenceLabel} onChange={e => setAssignCadenceLabel(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="Weekly checkpoint, self-paced, seminar rhythm..." />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium text-neutral-700">Due note</span>
                <input value={assignDueLabel} onChange={e => setAssignDueLabel(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="Complete before May 20 / quiz opens after lesson 2" />
              </label>
            </div>

            {assignCourseError ? <InlineMessage tone="error" text={assignCourseError} /> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeAssignCourseModal} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button type="button" onClick={() => void onAssignCourseSubmit()} disabled={assigningCourse} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {assigningCourse ? 'Assigning...' : 'Assign course'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showInviteModal ? (
        <ModalShell title="Invite learner" subtitle={selectedInviteClass ? `Send a join request to ${selectedInviteClass.name} by email.` : 'Send a join request by email.'} onClose={closeInviteModal}>
          <div className="space-y-5">
            <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(236,244,255,0.82))] p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">Invite flow</span>
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-800">Pending until accepted</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-neutral-600">Send the invite to an existing account email. The learner will see it in their top-right inbox and can accept it from there.</p>
            </div>

            <label className="grid gap-1">
              <span className="text-sm font-medium text-neutral-700">Existing user email</span>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="rounded-[22px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400" placeholder="student@example.com" />
            </label>

            {inviteError ? <InlineMessage tone="error" text={inviteError} /> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeInviteModal} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Cancel
              </button>
              <button type="button" onClick={() => void onInviteSubmit()} disabled={invitingUser} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {invitingUser ? 'Sending...' : 'Send invite'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showStatsModal ? (
        <ModalShell title="Global course statistics" subtitle="A cross-class view of participation, activity, and quiz performance for this authored course." onClose={closeStatsModal} wide>
          <div className="max-h-[78vh] overflow-y-auto pr-1">
            {courseStatsLoading ? (
              <InlineMessage tone="neutral" text="Loading statistics..." />
            ) : courseStatsError ? (
              <InlineMessage tone="error" text={courseStatsError} />
            ) : activeCourseStats ? (
              <>
                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  <MiniMetric label="Assigned groups" value={String(activeCourseStats.course.assignedGroupsCount)} />
                  <MiniMetric label="Participants" value={String(activeCourseStats.course.participantCount)} />
                  <MiniMetric label="Attempts" value={String(activeCourseStats.course.attemptsCount)} />
                  <MiniMetric label="Avg. score" value={activeCourseStats.course.avgQuizScore == null ? 'No data' : `${activeCourseStats.course.avgQuizScore}%`} />
                </div>

                <div className="mt-5 rounded-[24px] border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{activeCourseStats.course.category}</p>
                  <h4 className="mt-2 text-lg font-semibold text-neutral-900">{activeCourseStats.course.title}</h4>
                  <p className="mt-1 text-sm text-neutral-600">{formatLevel(activeCourseStats.course.level)}</p>
                </div>

                <div className="mt-5 rounded-[24px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(248,244,233,0.82),_rgba(255,255,255,0.98))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Per test breakdown</p>
                      <h4 className="mt-2 text-lg font-semibold text-neutral-900">Quiz-level course statistics</h4>
                      <p className="mt-1 text-sm text-neutral-600">Every test inside this course gets its own metrics and participant results.</p>
                    </div>
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700">
                      {activeCourseStats.quizzes.length} tests
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {activeCourseStats.quizzes.map(quiz => (
                    <article key={quiz.id} className="rounded-[24px] border border-white bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{quiz.lessonTitle}</p>
                            <h5 className="mt-2 text-lg font-semibold text-neutral-900">{quiz.title}</h5>
                            <p className="mt-1 text-sm text-neutral-600">
                              Pass at {quiz.passingScore}% / {quiz.timeLimitMin == null ? 'No timer' : quiz.timeLimitMin + ' min'} / {quiz.maxAttempts == null ? 'Unlimited tries' : quiz.maxAttempts + ' tries'}
                            </p>
                            <p className="mt-1 text-sm text-neutral-500">{formatQuizAvailabilityLabel(quiz)}</p>
                          </div>
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
                            {quiz.participantCount} participants
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-5">
                          <MiniMetric label="Attempts" value={String(quiz.attemptsCount)} />
                          <MiniMetric label="Participants" value={String(quiz.participantCount)} />
                          <MiniMetric label="Avg. score" value={quiz.avgScore == null ? 'No data' : quiz.avgScore + '%'} />
                          <MiniMetric label="Pass rate" value={quiz.passRate == null ? 'No data' : quiz.passRate + '%'} />
                          <MiniMetric label="Last activity" value={quiz.lastActivity ? formatDateLabel(quiz.lastActivity) : 'Waiting'} />
                        </div>

                        <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
                          {quiz.participantResults.map(result => (
                            <div key={result.id} className="rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  {result.profileBlocked ? (
                                    <span className="font-medium text-neutral-900">{result.name}</span>
                                  ) : (
                                    <Link to={`/profile/${result.id}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">{result.name}</Link>
                                  )}
                                  <p className="mt-1 text-sm text-neutral-500">{result.groupNames.join(', ') || 'No classes linked'}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <EnrollmentPill enrolled={result.isEnrolled} />
                                  <span className={[
                                    'rounded-full px-3 py-1 text-sm font-medium',
                                    result.hasPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                                  ].join(' ')}>
                                    {result.hasPassed ? 'Passed' : 'Not passed yet'}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <MiniMetric label="Attempts" value={String(result.attemptsCount)} />
                                <MiniMetric label="Avg. score" value={result.avgScore == null ? 'No data' : result.avgScore + '%'} />
                                <MiniMetric label="Best score" value={result.bestScore == null ? 'No data' : result.bestScore + '%'} />
                                <MiniMetric label="Last activity" value={result.lastActivity ? formatDateLabel(result.lastActivity) : 'Waiting'} />
                              </div>
                            </div>
                          ))}
                          {quiz.participantResults.length === 0 ? <EmptyCard text="No class participant has attempted this test yet." compact /> : null}
                        </div>
                      </article>
                    ))}
                    {activeCourseStats.quizzes.length === 0 ? <EmptyCard text="This course does not contain any tests yet." compact /> : null}
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {activeCourseStats.participants.map(participant => (
                    <article key={participant.id} className="rounded-[24px] border border-neutral-200 bg-white px-4 py-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          {participant.profileBlocked ? (
                            <span className="font-medium text-neutral-900">{participant.name}</span>
                          ) : (
                            <Link to={`/profile/${participant.id}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">{participant.name}</Link>
                          )}
                          <p className="mt-1 text-sm text-neutral-500">{participant.groupNames.join(', ') || 'No classes linked'}</p>
                        </div>
                        <EnrollmentPill enrolled={participant.isEnrolled} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <MiniMetric label="Avg. score" value={participant.avgQuizScore == null ? 'No attempts' : `${participant.avgQuizScore}%`} />
                        <MiniMetric label="Attempts" value={String(participant.attemptsCount)} />
                        <MiniMetric label="Passed quizzes" value={String(participant.passedQuizzesCount)} />
                        <MiniMetric label="Last activity" value={participant.lastActivity ? formatDateLabel(participant.lastActivity) : 'Waiting'} />
                      </div>
                    </article>
                  ))}
                  {activeCourseStats.participants.length === 0 ? <EmptyCard text="No participants have reached this course through your classes yet." compact /> : null}
                </div>
              </>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </section>
  )
}

function OverviewCard({ metric }: { metric: GroupsOverviewMetric }) {
  return (
    <article className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm shadow-black/5">
      <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">{metric.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{metric.hint}</p>
    </article>
  )
}

function TeacherWorkspace({
  classrooms,
  participants,
  limits,
  onCreateClass,
  onAssignCourse,
  onEditClass,
  onInviteUser,
  onOpenCourseStats,
}: {
  classrooms: TeacherClassroom[]
  participants: TeacherParticipant[]
  limits: TeacherLimits
  onCreateClass: () => void
  onAssignCourse: (classId: string) => void
  onEditClass: (classroom: TeacherClassroom) => void
  onInviteUser: (classId: string) => void
  onOpenCourseStats: (courseId: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="rounded-[30px] border border-neutral-200 bg-white p-5 md:p-6 shadow-sm shadow-black/5 transition duration-500 ease-out hover:shadow-md hover:shadow-black/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionHeading
              icon={<Users className="size-5" />}
              title="Active Classrooms"
              subtitle="Each class card combines scheduling context, invite code, participant preview and assigned course tracks."
            />
            <button type="button" onClick={onCreateClass} className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
              <Plus className="size-4" />
              Create class
            </button>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {classrooms.map((classroom, index) => (
              <Reveal key={classroom.id} delay={80 + index * 45}>
                <TeacherClassroomCard
                  classroom={classroom}
                  onAssignCourse={onAssignCourse}
                  onEditClass={onEditClass}
                  onInviteUser={onInviteUser}
                  onOpenCourseStats={onOpenCourseStats}
                />
              </Reveal>
            ))}
            {classrooms.length === 0 && <EmptyCard text="No classrooms yet. Once you create and assign groups, they will appear here." />}
          </div>
        </section>

        <section className="rounded-[30px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(245,242,233,0.92),_rgba(255,255,255,0.96))] p-5 md:p-6 shadow-sm shadow-black/5 transition duration-500 ease-out hover:shadow-md hover:shadow-black/5">
          <SectionHeading
            icon={<BarChart3 className="size-5" />}
            title="Participants To Watch"
            subtitle="A fast read on who already engaged and who still needs their first attempt."
          />
          <div className="mt-5 space-y-3">
            {participants.map((participant, index) => (
              <Reveal key={`${participant.id}-${participant.groupName}`} delay={120 + index * 35}>
                <ParticipantRow participant={participant} />
              </Reveal>
            ))}
            {participants.length === 0 && <EmptyCard text="No participant data yet. Quiz attempts and enrollments will surface here automatically." compact />}
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
        <span>Create courses in My Products first, then you can attach them to classes here.</span>
        {limits.assignmentsLimit > 0 ? <span>Assignments used: {limits.assignmentsUsed} / {limits.assignmentsLimit}</span> : null}
        <span>Classes used: {limits.classesUsed} / {limits.classesLimit ?? 'Unlimited'}</span>
      </div>
    </div>
  )
}
function TeacherClassroomCard({
  classroom,
  onAssignCourse,
  onEditClass,
  onInviteUser,
  onOpenCourseStats,
}: {
  classroom: TeacherClassroom
  onAssignCourse: (classId: string) => void
  onEditClass: (classroom: TeacherClassroom) => void
  onInviteUser: (classId: string) => void
  onOpenCourseStats: (courseId: string) => void
}) {
  const [showAllStudents, setShowAllStudents] = useState(false)
  const visibleStudents = showAllStudents ? classroom.students : classroom.students.slice(0, 5)
  const hiddenCount = Math.max(classroom.students.length - visibleStudents.length, 0)

  return (
    <article className="flex h-full flex-col rounded-[26px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.76))] p-5 shadow-sm transition duration-500 ease-out hover:-translate-y-1 hover:shadow-md hover:shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">{classroom.focusArea || 'Classroom'}</p>
          <Link to={`/groups-classes/${classroom.id}`} className="mt-2 block text-xl font-semibold leading-tight text-neutral-900 underline-offset-4 hover:underline">{classroom.name}</Link>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700">
          <span className="text-base font-semibold text-neutral-900">{classroom.studentsCount}</span>
          <span>students</span>
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-neutral-600">{classroom.description}</p>

      <div className="mt-4 grid gap-2 text-sm text-neutral-700">
        <InfoLine icon={<CalendarDays className="size-4" />} text={classroom.meetingLabel || 'Schedule to be added'} />
        <InfoLine icon={<MapPin className="size-4" />} text={classroom.locationLabel || 'Location to be added'} />
        <InfoLine icon={<KeyRound className="size-4" />} text={`Invite code: ${classroom.inviteCode || 'Not set yet'}`} />
      </div>
      {classroom.roomLink && (
        <a
          href={classroom.roomLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 self-start rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-100"
        >
          Open room
          <ExternalLink className="size-4" />
        </a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAssignCourse(classroom.id)} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
          Assign course
        </button>
        <button type="button" onClick={() => onEditClass(classroom)} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
          Edit class
        </button>
        <button type="button" onClick={() => onInviteUser(classroom.id)} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
          Invite learner
        </button>
        <Link to={`/groups-classes/${classroom.id}`} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
          Open class
        </Link>
      </div>

      <div className="mt-5 rounded-[24px] border border-white bg-white/80 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-neutral-800">Participants</p>
          {classroom.students.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAllStudents(value => !value)}
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
            >
              {showAllStudents ? 'Show less' : 'Show all students (' + classroom.students.length + ')'}
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {visibleStudents.map(student => (
            student.profileBlocked ? (
              <span
                key={student.id}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm"
              >
                <AvatarBubble name={student.name} avatarUrl={student.avatarUrl} />
                {student.name}
              </span>
            ) : (
              <Link
                key={student.id}
                to={`/profile/${student.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-100"
              >
                <AvatarBubble name={student.name} avatarUrl={student.avatarUrl} />
                {student.name}
              </Link>
            )
          ))}
          {classroom.students.length === 0 && <span className="text-sm text-neutral-500">No students joined yet.</span>}
        </div>
        {!showAllStudents && hiddenCount > 0 ? (
          <p className="mt-3 text-sm text-neutral-500">+ {hiddenCount} more participant{hiddenCount === 1 ? '' : 's'} hidden from the compact view.</p>
        ) : null}
      </div>

      <div className="mt-5 space-y-2 border-t border-neutral-200 pt-4">
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>Assigned tracks</span>
          <span>{classroom.assignedCoursesCount}</span>
        </div>
        {classroom.courses.map(course => (
          <div key={course.id} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link to={`/course/${course.id}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
                  {course.title}
                </Link>
                <p className="mt-1 text-sm text-neutral-600">{formatLevel(course.level)} / {course.cadenceLabel || 'Flexible cadence'}</p>
                <p className="mt-1 text-sm text-neutral-500">{course.dueLabel || 'No due label yet'}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenCourseStats(course.id)}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100"
              >
                View stats
              </button>
            </div>
          </div>
        ))}
        {classroom.courses.length === 0 ? <EmptyCard text="No courses assigned yet. Use Assign course to connect one of your authored tracks." compact /> : null}
      </div>
    </article>
  )
}
function StudentWorkspace({
  classrooms,
  assignedCourses,
  recentAttempts,
  joinCode,
  joinCodeError,
  joinCodeSuccess,
  joiningByCode,
  onJoinCodeChange,
  onJoinByCode,
}: {
  classrooms: StudentClassroom[]
  assignedCourses: StudentAssignedCourse[]
  recentAttempts: StudentRecentAttempt[]
  joinCode: string
  joinCodeError: string
  joinCodeSuccess: string
  joiningByCode: boolean
  onJoinCodeChange: (value: string) => void
  onJoinByCode: () => void
}) {
  return (
    <div className="space-y-6">
        <section className="rounded-[30px] border border-neutral-200 bg-[linear-gradient(135deg,_rgba(247,243,233,0.92),_rgba(255,255,255,0.98)_52%,_rgba(234,242,236,0.78))] p-5 md:p-6 shadow-sm shadow-black/5 transition duration-500 ease-out hover:shadow-md hover:shadow-black/5">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-2">
            <SectionHeading
              icon={<KeyRound className="size-5" />}
              title="Join a class by code"
              subtitle="Paste the invite code from your teacher. If that class already has assigned courses, they will be added to your classroom flow automatically."
            />
            <p className="text-sm leading-6 text-neutral-600">This works best in Student mode, because joined classes and their assignments immediately become visible here.</p>
          </div>
          <div className="rounded-[26px] border border-white/80 bg-white/90 p-4 shadow-sm">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-600">Invite code</span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={joinCode}
                  onChange={event => onJoinCodeChange(event.target.value.toUpperCase())}
                  placeholder="e.g. ANTIQUITY-7"
                  className="min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm uppercase tracking-[0.16em] text-neutral-900 outline-none transition focus:border-neutral-400"
                />
                <button
                  type="button"
                  onClick={onJoinByCode}
                  disabled={joiningByCode}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  {joiningByCode ? 'Joining...' : 'Join class'}
                </button>
              </div>
            </label>
            {joinCodeError ? <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{joinCodeError}</p> : null}
            {joinCodeSuccess ? <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{joinCodeSuccess}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-neutral-200 bg-white p-5 md:p-6 shadow-sm shadow-black/5">
        <SectionHeading
          icon={<GraduationCap className="size-5" />}
          title="My Classes"
          subtitle="A compact view of where you meet, what is assigned, and which tracks are already open for you."
        />
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {classrooms.map((classroom, index) => (
            <Reveal key={classroom.id} delay={80 + index * 45}>
              <StudentClassroomCard classroom={classroom} />
            </Reveal>
          ))}
          {classrooms.length === 0 && <EmptyCard text="You are not in any classes yet. When a teacher adds you, your classroom hub will appear here." />}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <section className="rounded-[30px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.7))] p-5 md:p-6 shadow-sm shadow-black/5">
          <SectionHeading
            icon={<BookOpen className="size-5" />}
            title="Assigned Courses"
            subtitle="Class-linked course cards that tell you what is available right now and what still needs publishing or enrollment."
          />
          <div className="mt-5 space-y-3">
            {assignedCourses.map((course, index) => (
              <Reveal key={course.id} delay={110 + index * 35}>
                <StudentCourseRow course={course} />
              </Reveal>
            ))}
            {assignedCourses.length === 0 && <EmptyCard text="No courses are currently assigned to your classes." compact />}
          </div>
        </section>

        <section className="rounded-[30px] border border-neutral-200 bg-white p-5 md:p-6 shadow-sm shadow-black/5">
          <SectionHeading
            icon={<ShieldCheck className="size-5" />}
            title="Recent Attempts"
            subtitle="Your newest quiz results, so you can keep track of progress without reopening every lesson."
          />
          <div className="mt-5 space-y-3">
            {recentAttempts.map((attempt, index) => (
              <Reveal key={attempt.id} delay={140 + index * 30}>
                <AttemptRow attempt={attempt} />
              </Reveal>
            ))}
            {recentAttempts.length === 0 && <EmptyCard text="Once you submit lesson quizzes, they will show up here with timestamps and scores." compact />}
          </div>
        </section>
      </div>
    </div>
  )
}

function StudentClassroomCard({ classroom }: { classroom: StudentClassroom }) {
  return (
    <article className="rounded-[26px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.76))] p-5 shadow-sm transition duration-500 ease-out hover:-translate-y-1 hover:shadow-md hover:shadow-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{classroom.focusArea || 'Classroom'}</p>
          <Link to={`/groups-classes/${classroom.id}`} className="mt-2 block text-xl font-semibold text-neutral-900 underline-offset-4 hover:underline">{classroom.name}</Link>
        </div>
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-700">
          {classroom.teacherName}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-neutral-600">{classroom.description}</p>

      <div className="mt-4 grid gap-2 text-sm text-neutral-700">
        <InfoLine icon={<CalendarDays className="size-4" />} text={classroom.meetingLabel || 'Schedule to be announced'} />
        <InfoLine icon={<MapPin className="size-4" />} text={classroom.locationLabel || 'Location to be announced'} />
      </div>
      {classroom.roomLink && (
        <a
          href={classroom.roomLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 self-start rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-100"
        >
          Open room
          <ExternalLink className="size-4" />
        </a>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/groups-classes/${classroom.id}`} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100">
          Open class
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniMetric label="Assigned" value={String(classroom.assignedCoursesCount)} />
        <MiniMetric label="Joined" value={String(classroom.activeEnrollmentsCount)} />
      </div>

      <div className="mt-5 space-y-2 border-t border-neutral-200 pt-4">
        {classroom.courses.map(course => (
          <div key={course.id} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
            <Link to={`/course/${course.id}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
              {course.title}
            </Link>
            <p className="mt-1 text-sm text-neutral-600">{course.cadenceLabel || 'Flexible pace'}</p>
            <p className="mt-1 text-sm text-neutral-500">{course.dueLabel || 'No due note yet'}</p>
          </div>
        ))}
      </div>
    </article>
  )
}

function StudentCourseRow({ course }: { course: StudentAssignedCourse }) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white px-4 py-4 shadow-sm transition duration-500 ease-out hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{course.category} / {formatLevel(course.level)}</p>
          <h3 className="mt-2 text-lg font-semibold text-neutral-900">{course.title}</h3>
          <p className="mt-1 text-sm text-neutral-600">by {course.authorName}</p>
        </div>
        <EnrollmentPill enrolled={course.isEnrolled} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {course.groupNames.map(groupName => (
          <span key={groupName} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
            {groupName}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniMetric label="Lessons" value={String(course.lessonCount)} />
        <MiniMetric label="Access" value={course.accessMode === 'class-only' ? 'Class only' : course.accessMode === 'public-paid' ? 'Paid' : 'Free'} />
        <MiniMetric label="Quiz average" value={course.avgQuizScore == null ? 'No attempts' : `${course.avgQuizScore}%`} />
        <MiniMetric label="Last attempt" value={course.lastAttemptAt ? formatDateLabel(course.lastAttemptAt) : 'Waiting'} />
      </div>

      <div className="mt-4">
        <Link
          to={`/course/${course.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
        >
          Open course
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  )
}

function AttemptRow({ attempt }: { attempt: StudentRecentAttempt }) {
  return (
    <article className="rounded-[24px] border border-neutral-200 bg-neutral-50 px-4 py-4 shadow-sm transition duration-500 ease-out hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5">
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

function PersonalWorkspace({
  ownedCoursesCount,
  savedCoursesCount,
  message,
}: {
  ownedCoursesCount: number
  savedCoursesCount: number
  message: string
}) {
  return (
    <section className="rounded-[32px] border border-neutral-200 bg-[linear-gradient(135deg,_rgba(248,244,233,0.9),_rgba(255,255,255,1)_55%,_rgba(234,241,236,0.92))] p-6 md:p-8 shadow-sm shadow-black/5">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <SectionHeading
            icon={<Lock className="size-5" />}
            title="Classes stay off in Personal mode"
            subtitle="You can still discover courses, save them, and build your own catalog here. Classroom tools appear only in Student and Teacher mode."
          />
          <p className="max-w-3xl text-sm leading-7 text-neutral-700">{message}</p>
          <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5">Create and edit courses</span>
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5">Review creator statistics</span>
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1.5">Switch to Student or Teacher for classes</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/discover" className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
              Explore courses
              <ArrowRight className="size-4" />
            </Link>
            <Link to="/my-products" className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800">
              Open creator tools
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <article className="rounded-[24px] border border-black/10 bg-white/90 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Saved courses</p>
            <p className="mt-3 text-3xl font-semibold">{savedCoursesCount}</p>
            <p className="mt-2 text-sm text-neutral-600">Keep your own learning list here, without the extra classroom controls.</p>
          </article>
          <article className="rounded-[24px] border border-black/10 bg-white/90 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Created courses</p>
            <p className="mt-3 text-3xl font-semibold">{ownedCoursesCount}</p>
            <p className="mt-2 text-sm text-neutral-600">You can still create courses and review their statistics in My Products.</p>
          </article>
        </div>
      </div>
    </section>
  )
}

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={[
        className,
        'transition-all duration-500 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      ].join(' ')}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <Reveal className="w-full" delay={0}>
        <div className={`mx-auto w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} rounded-[30px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,1),_rgba(252,250,246,0.98))] p-5 shadow-2xl shadow-black/10`}>
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
            <button type="button" onClick={onClose} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Close
            </button>
          </div>
          {children}
        </div>
      </Reveal>
    </div>
  )
}

function InlineMessage({ tone, text }: { tone: 'neutral' | 'error'; text: string }) {
  const className = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-neutral-200 bg-neutral-50 text-neutral-600'

  return <div className={`rounded-[20px] border px-4 py-3 text-sm ${className}`}>{text}</div>
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

function AvatarBubble({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="size-6 rounded-full object-cover" />
  }

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('')

  return <span className="grid size-6 place-items-center rounded-full bg-neutral-200 text-[11px] font-medium text-neutral-700">{initials || 'U'}</span>
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-neutral-800">{value}</p>
    </div>
  )
}

function EnrollmentPill({ enrolled }: { enrolled: boolean }) {
  return (
    <span className={[
      'rounded-full px-3 py-1 text-sm font-medium',
      enrolled ? 'bg-sky-100 text-sky-800' : 'bg-neutral-200 text-neutral-700',
    ].join(' ')}>
      {enrolled ? 'Enrolled' : 'Not joined'}
    </span>
  )
}

function ParticipantRow({ participant }: { participant: TeacherParticipant }) {
  return (
    <article className="rounded-[24px] border border-neutral-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">{participant.name}</p>
          <p className="mt-1 text-sm text-neutral-500">{participant.groupName}</p>
        </div>
        <ParticipantStatusPill label={participant.statusLabel} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric label="Assigned" value={String(participant.assignedCoursesCount)} />
        <MiniMetric label="Enrolled" value={String(participant.enrolledCoursesCount)} />
        <MiniMetric label="Avg. score" value={participant.avgQuizScore == null ? 'No attempts' : `${participant.avgQuizScore}%`} />
        <MiniMetric label="Last activity" value={participant.lastActivity ? formatDateLabel(participant.lastActivity) : 'Waiting'} />
      </div>
    </article>
  )
}
function ParticipantStatusPill({ label }: { label: string }) {
  const className = label === 'Strong progress'
    ? 'bg-emerald-100 text-emerald-800'
    : label === 'On track'
      ? 'bg-sky-100 text-sky-800'
      : label === 'Needs attention'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-neutral-200 text-neutral-700'

  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${className}`}>{label}</span>
}

function EmptyCard({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={[
      'grid place-items-center rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(246,243,235,0.72))] text-center text-neutral-500 shadow-sm',
      compact ? 'px-4 py-10' : 'px-5 py-16',
    ].join(' ')}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        <span className="grid size-11 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm">
          <Sparkles className="size-4" />
        </span>
        <p className="mt-4 text-sm leading-6 text-neutral-600">{text}</p>
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








function formatQuizAvailabilityLabel(quiz: TeacherCourseStats['quizzes'][number]) {
  const scope = quiz.accessScope === 'group'
    ? quiz.accessGroupName ? 'Group only: ' + quiz.accessGroupName : 'Group only'
    : 'Available to enrolled course participants'

  if (quiz.availableFrom && quiz.availableTo) {
    return scope + ' / Opens ' + formatDateLabel(quiz.availableFrom) + ' / Closes ' + formatDateLabel(quiz.availableTo)
  }

  if (quiz.availableFrom) {
    return scope + ' / Opens ' + formatDateLabel(quiz.availableFrom)
  }

  if (quiz.availableTo) {
    return scope + ' / Closes ' + formatDateLabel(quiz.availableTo)
  }

  return scope + ' / Open now'
}











