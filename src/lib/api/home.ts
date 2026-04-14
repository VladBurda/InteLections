import type { Course } from '../../types/course';
import { request } from './core';

export function getHomeCourses(query = '') {
  return request<Course[]>(`/api/home-courses?query=${encodeURIComponent(query)}`);
}

export function removeHomeCourse(courseId: string) {
  return request<{ removed: true }>(`/api/home-courses/${encodeURIComponent(courseId)}/remove`, {
    method: 'POST',
  });
}

export function toggleProductStar(courseId: string) {
  return request<{ starred: boolean }>(`/api/my-products/${encodeURIComponent(courseId)}/toggle-star`, {
    method: 'POST',
  });
}
