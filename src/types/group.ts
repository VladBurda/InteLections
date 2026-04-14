import type { CourseAccessMode } from './product';
import type { User } from './user';

export type GroupsOverviewMetric = {
  label: string;
  value: string;
  hint: string;
};

export type TeacherClassroom = {
  id: string;
  name: string;
  description: string;
  focusArea: string;
  meetingLabel: string;
  locationLabel: string;
  roomLink?: string;
  inviteCode: string;
  studentsCount: number;
  assignedCoursesCount: number;
  students: Array<{ id: string; name: string; avatarUrl?: string; profileBlocked?: boolean }>;
  courses: Array<{
    id: string;
    title: string;
    publishStatus: string;
    level: string;
    cadenceLabel: string;
    dueLabel: string;
  }>;
};

export type TeacherAvailableCourse = {
  id: string;
  title: string;
  category: string;
  level: string;
  publishStatus: string;
};

export type TeacherLimits = {
  assignmentsUsed: number;
  assignmentsLimit: number;
  classesUsed: number;
  classesLimit: number | null;
};

export type TeacherParticipant = {
  id: string;
  name: string;
  groupName: string;
  assignedCoursesCount: number;
  enrolledCoursesCount: number;
  avgQuizScore: number | null;
  lastActivity: string;
  statusLabel: string;
  profileBlocked?: boolean;
};

export type StudentClassroom = {
  id: string;
  name: string;
  description: string;
  focusArea: string;
  meetingLabel: string;
  locationLabel: string;
  roomLink?: string;
  teacherId?: string;
  teacherName: string;
  teacherProfileBlocked?: boolean;
  assignedCoursesCount: number;
  activeEnrollmentsCount: number;
  courses: Array<{
    id: string;
    title: string;
    publishStatus: string;
    cadenceLabel: string;
    dueLabel: string;
  }>;
};

export type StudentAssignedCourse = {
  id: string;
  title: string;
  category: string;
  level: string;
  publishStatus: string;
  accessMode?: CourseAccessMode;
  accessType: string;
  authorId?: string;
  authorName: string;
  authorProfileBlocked?: boolean;
  lessonCount: number;
  avgQuizScore: number | null;
  isEnrolled: boolean;
  groupNames: string[];
  lastAttemptAt: string;
};

export type StudentRecentAttempt = {
  id: string;
  courseTitle: string;
  quizTitle: string;
  scorePercent: number;
  passed: boolean;
  submittedAt: string;
};

export type GroupsClassesDashboard = {
  audience: 'teacher' | 'student' | 'personal';
  viewer: {
    id: string;
    firstName: string;
    role: User['role'];
  };
  overview: GroupsOverviewMetric[];
  teacher?: {
    classrooms: TeacherClassroom[];
    participants: TeacherParticipant[];
    availableCourses: TeacherAvailableCourse[];
    limits: TeacherLimits;
  };
  student?: {
    classrooms: StudentClassroom[];
    assignedCourses: StudentAssignedCourse[];
    recentAttempts: StudentRecentAttempt[];
  };
  personal?: {
    ownedCoursesCount: number;
    savedCoursesCount: number;
    message: string;
  };
};

export type TeacherClassDetail = {
  audience: 'teacher';
  classroom: TeacherClassroom & {
    pendingInvitesCount: number;
    avgQuizScore: number | null;
    attemptsCount: number;
    lastActivity: string;
  };
  participants: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    joinedAt: string;
    assignedCoursesCount: number;
    enrolledCoursesCount: number;
    avgQuizScore: number | null;
    attemptsCount: number;
    passedQuizzesCount: number;
    lastActivity: string;
    statusLabel: string;
    profileBlocked?: boolean;
  }>;
  courses: Array<{
    id: string;
    title: string;
    category: string;
    level: string;
    publishStatus: string;
    cadenceLabel: string;
    dueLabel: string;
    lessonCount: number;
    quizCount: number;
    participantCount: number;
    enrolledCount: number;
    avgQuizScore: number | null;
    lastActivity: string;
  }>;
  pendingInvites: Array<{
    id: string;
    recipientEmail: string;
    createdAt: string;
  }>;
  availableCourses: TeacherAvailableCourse[];
  limits: TeacherLimits;
};

export type StudentClassDetail = {
  audience: 'student';
  classroom: StudentClassroom;
  courses: Array<{
    id: string;
    title: string;
    category: string;
    level: string;
    publishStatus: string;
    accessMode?: CourseAccessMode;
    accessType: string;
    cadenceLabel: string;
    dueLabel: string;
    lessonCount: number;
    avgQuizScore: number | null;
    isEnrolled: boolean;
    lastAttemptAt: string;
  }>;
  recentAttempts: StudentRecentAttempt[];
};

export type ClassDetail = TeacherClassDetail | StudentClassDetail;

export type TeacherCourseStats = {
  course: {
    id: string;
    title: string;
    category: string;
    level: string;
    publishStatus: string;
    assignedGroupsCount: number;
    participantCount: number;
    attemptsCount: number;
    avgQuizScore: number | null;
    salesCount: number;
    grossRevenueCents: number;
    platformFeeCents: number;
    netPayoutCents: number;
    lastSaleAt: string;
  };
  participants: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
    groupNames: string[];
    avgQuizScore: number | null;
    attemptsCount: number;
    passedQuizzesCount: number;
    lastActivity: string;
    isEnrolled: boolean;
    profileBlocked?: boolean;
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    lessonId: string;
    lessonTitle: string;
    passingScore: number;
    timeLimitMin: number | null;
    maxAttempts: number | null;
    availableFrom: string | null;
    availableTo: string | null;
    accessScope: 'course' | 'group';
    accessGroupName?: string | null;
    attemptsCount: number;
    participantCount: number;
    passedParticipantsCount: number;
    passedAttemptsCount: number;
    avgScore: number | null;
    passRate: number | null;
    lastActivity: string;
    participantResults: Array<{
      id: string;
      name: string;
      avatarUrl?: string;
      groupNames: string[];
      attemptsCount: number;
      avgScore: number | null;
      bestScore: number | null;
      hasPassed: boolean;
      lastActivity: string;
      isEnrolled: boolean;
      profileBlocked?: boolean;
    }>;
  }>;
  sales: Array<{
    id: string;
    status: string;
    buyerName: string;
    buyerEmail: string;
    amountCents: number;
    currency: string;
    platformFeeCents: number;
    netPayoutCents: number;
    paidAt: string;
    checkoutSessionId: string;
    paymentIntentId: string;
  }>;
};

export type ClassInvite = {
  id: string;
  groupId: string;
  className: string;
  focusArea?: string;
  meetingLabel?: string;
  locationLabel?: string;
  roomLink?: string;
  teacherName: string;
  createdAt: string;
};

export type ClassInviteInbox = {
  hideClassInviteMessages: boolean;
  pendingCount: number;
  invites: ClassInvite[];
};

export type CreateLearningGroupInput = {
  name: string;
  description?: string;
  focusArea?: string;
  meetingLabel?: string;
  locationLabel?: string;
  roomLink?: string;
};
