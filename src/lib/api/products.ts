import type { ProductCourse, CourseAccessMode } from '../../types/product';
import { request, fileToBase64 } from './core';

export type CreateProductInput = {
  title: string;
  description?: string;
  category?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  accessMode?: CourseAccessMode;
  accessType?: 'free' | 'paid';
  priceCents?: number | null;
  currency?: string | null;
  templateKey?: string;
  coverImage?: File | null;
  removeCoverImage?: boolean;
  allowLearnerUploads?: boolean;
  learnerUploadNote?: string;
};

export function getMyProducts(query = '') {
  return request<ProductCourse[]>(`/api/my-products?query=${encodeURIComponent(query)}`);
}

export async function createProduct(payload: CreateProductInput) {
  const coverImage = payload.coverImage
    ? {
        mimeType: payload.coverImage.type,
        base64Data: await fileToBase64(payload.coverImage),
      }
    : null;

  return request<{ id: string; title: string }>('/api/my-products/create', {
    method: 'POST',
    body: {
      ...payload,
      coverImage,
      removeCoverImage: Boolean(payload.removeCoverImage),
    },
  });
}

export async function updateProduct(courseId: string, payload: CreateProductInput) {
  const coverImage = payload.coverImage
    ? {
        mimeType: payload.coverImage.type,
        base64Data: await fileToBase64(payload.coverImage),
      }
    : null;

  return request<{ id: string; title: string }>(`/api/my-products/${encodeURIComponent(courseId)}`, {
    method: 'PUT',
    body: {
      ...payload,
      coverImage,
      removeCoverImage: Boolean(payload.removeCoverImage),
    },
  });
}

export function removeProduct(courseId: string) {
  return request<{ removed: true }>(`/api/my-products/${encodeURIComponent(courseId)}/remove`, {
    method: 'POST',
  });
}
