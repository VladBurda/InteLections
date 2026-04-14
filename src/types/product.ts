export type ProductStatus = 'Published' | 'Non posted';
export type CourseAccessMode = 'public-free' | 'public-paid' | 'class-only';

export type ProductCourse = {
  id: string;
  title: string;
  author: string;
  status: ProductStatus;
  description?: string;
  category?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  accessType?: 'free' | 'paid';
  accessMode?: CourseAccessMode;
  priceCents?: number | null;
  currency?: string | null;
  thumbnailUrl?: string;
  templateKey?: string;
  allowLearnerUploads?: boolean;
  learnerUploadNote?: string;
  starred?: boolean;
  addedSeq?: number;
  publishBlocked?: boolean;
  publishBlockMessage?: string;
};
