import type { Course } from '../../types/course';
import type { CourseAccessMode } from '../../types/product';
import { request } from './core';

export type DiscoverCourse = Course & {
  category: string;
  accessMode?: CourseAccessMode;
  accessType?: 'free' | 'paid';
  priceCents?: number | null;
  currency?: string | null;
  country?: string;
  saved?: boolean;
  enrolled?: boolean;
  authorId?: string;
  authorProfileBlocked?: boolean;
};

export type DiscoverPayload = {
  trends: DiscoverCourse[];
  popular: DiscoverCourse[];
  humanities: DiscoverCourse[];
  categories: string[];
};

export function getDiscover(params: { query?: string; category?: string; author?: string }) {
  const query = params.query ?? '';
  const category = params.category ?? 'All';
  const author = params.author ?? '';
  return request<DiscoverPayload>(
    `/api/discover?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&author=${encodeURIComponent(author)}`,
  );
}

export function saveCourseToHome(courseId: string) {
  return request<{ saved: true }>(`/api/discover/${encodeURIComponent(courseId)}/save`, {
    method: 'POST',
  });
}

export function unsaveCourseFromHome(courseId: string) {
  return request<{ removed: true }>(`/api/discover/${encodeURIComponent(courseId)}/unsave`, {
    method: 'POST',
  });
}
