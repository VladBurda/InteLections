import type { CourseAccessMode } from './product';
import type { LessonQuiz, QuizAttemptSummary } from './quiz';
import type { SubscriptionPlan } from './user';

export type Course = {
  id: string;
  title: string;
  author: string;
  starred?: boolean;
  addedSeq?: number;
  thumbnailUrl?: string;
  templateKey?: string;
  category?: string;
};

export type CourseEnrollment = {
  id: string;
  status: string;
  enrolledAt: string;
};

export type LessonMaterialSection = {
  id: string;
  title: string;
  description?: string;
  isPaidContent?: boolean;
  sortOrder?: number;
};

export type LessonMaterial = {
  id: string;
  title: string;
  materialKind: 'video' | 'audio' | 'document' | 'youtube';
  filePath: string;
  externalUrl?: string;
  originalName: string;
  description?: string;
  mimeType?: string;
  fileSizeBytes: number;
  videoDurationSeconds?: number | null;
  sectionId?: string | null;
  sortOrder?: number;
};

export type Lesson = {
  id: string;
  title: string;
  durationMin: number;
  isFreePreview?: boolean;
  materialSections: LessonMaterialSection[];
  materials: LessonMaterial[];
  quiz: LessonQuiz | null;
  latestAttempt?: QuizAttemptSummary | null;
};

export type LearnerCourseMaterial = {
  id: string;
  title: string;
  description?: string;
  filePath: string;
  originalName: string;
  mimeType?: string;
  fileSizeBytes: number;
  uploadedAt?: string;
  uploadedById?: string;
  uploadedByName?: string;
};

export type CourseDetails = {
  id: string;
  title: string;
  author: string;
  authorId?: string;
  thumbnailUrl?: string;
  templateKey?: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  priceCents?: number | null;
  currency?: string | null;
  accessMode?: CourseAccessMode;
  accessType?: 'free' | 'paid';
  publishStatus?: 'draft' | 'published' | 'archived';
  visibility?: 'public' | 'private' | 'unlisted';
  isOwner?: boolean;
  isPublished?: boolean;
  isEnrolled?: boolean;
  canAccessPaidContents?: boolean;
  canPublicEnroll?: boolean;
  requiresPurchase?: boolean;
  authorProfileBlocked?: boolean;
  publishBlocked?: boolean;
  publishBlockMessage?: string;
  purchaseStatus?: 'none' | 'pending' | 'paid' | 'failed';
  hasPaidAccess?: boolean;
  checkoutEligible?: boolean;
  hasAdminBypass?: boolean;
  viewerRole?: string;
  hasClassAccess?: boolean;
  canRate?: boolean;
  viewerRating?: number | null;
  viewerReview?: {
    stars: number;
    title?: string;
    text?: string;
    updatedAt?: string;
  } | null;
  enrollment?: CourseEnrollment | null;
  ownerGroups?: Array<{ id: string; name: string }>;
  courseGroups?: Array<{ id: string; name: string; meetingLabel?: string; locationLabel?: string }>;
  allowLearnerUploads?: boolean;
  learnerUploadNote?: string;
  viewerSubscriptionPlan?: SubscriptionPlan;
  quizGenerationAvailable?: boolean;
  quizGenerationReason?: string;
  learnerMaterials?: LearnerCourseMaterial[];
  storage?: {
    usedMb: number;
    remainingGb: number;
    limitGb: number;
    usagePercent: number;
  } | null;
  lessons: Lesson[];
  stats: { students: number; rating: number; reviews: number };
  courseReviews?: Array<{
    userId: string;
    name: string;
    avatarUrl?: string;
    stars: number;
    title?: string;
    text?: string;
    updatedAt?: string;
    profileBlocked?: boolean;
  }>;
};

export type CreateLessonInput = {
  title: string;
  durationMin: number;
  isFreePreview?: boolean;
};
