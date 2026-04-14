import type { CourseDetails, CreateLessonInput, LearnerCourseMaterial, Lesson, LessonMaterial, LessonMaterialSection } from '../../types/course';
import type { CreateLessonQuizInput, GeneratedLessonQuizDraft, GenerateLessonQuizDraftInput, LessonQuiz, QuizAttemptSummary, SubmitQuizAttemptInput } from '../../types/quiz';
import { request, fileToBase64 } from './core';

export function setCoursePublishBlock(courseId: string, payload: { blocked: boolean; message?: string }) {
  return request<{ blocked: boolean; message: string; publishStatus: string }>(`/api/admin/courses/${encodeURIComponent(courseId)}/publish-block`, {
    method: 'POST',
    body: payload,
  });
}

export function getCourseDetails(id: string) {
  return request<CourseDetails>(`/api/courses/${encodeURIComponent(id)}`);
}

export function rateCourse(courseId: string, stars: number) {
  return request<{ rating: number; reviews: number; viewerRating: number; viewerReview?: CourseDetails['viewerReview']; courseReviews?: CourseDetails['courseReviews'] }>(`/api/courses/${encodeURIComponent(courseId)}/rating`, {
    method: 'POST',
    body: { stars },
  });
}

export function submitCourseReview(courseId: string, payload: { stars?: number | null; title?: string; text?: string }) {
  return request<{ rating: number; reviews: number; viewerRating: number; viewerReview?: CourseDetails['viewerReview']; courseReviews?: CourseDetails['courseReviews'] }>(`/api/courses/${encodeURIComponent(courseId)}/review`, {
    method: 'POST',
    body: payload,
  });
}

export function deleteCourseReview(courseId: string) {
  return request<{ rating: number; reviews: number; viewerRating: number | null; viewerReview?: CourseDetails['viewerReview']; courseReviews?: CourseDetails['courseReviews'] }>(`/api/courses/${encodeURIComponent(courseId)}/review`, {
    method: 'DELETE',
  });
}

export function createLesson(courseId: string, payload: CreateLessonInput) {
  return request<Lesson>(`/api/courses/${encodeURIComponent(courseId)}/lessons`, {
    method: 'POST',
    body: payload,
  });
}

export function updateLesson(lessonId: string, payload: CreateLessonInput) {
  return request<{ lesson: Lesson }>(`/api/lessons/${encodeURIComponent(lessonId)}`, {
    method: 'PUT',
    body: payload,
  });
}

export async function uploadLessonMaterials(lessonId: string, items: Array<
  | { file: File; description?: string; sectionId?: string | null; videoDurationSeconds?: number | null }
  | { youtubeUrl: string; title?: string; description?: string; sectionId?: string | null }
>) {
  const formData = new FormData();
  const materials = items.map((item, index) => {
    if ('file' in item) {
      const fileField = `file_${index}`;
      formData.append(fileField, item.file, item.file.name);
      return {
        fileField,
        originalName: item.file.name,
        mimeType: item.file.type,
        description: item.description ?? '',
        sectionId: item.sectionId ?? null,
        videoDurationSeconds: item.videoDurationSeconds ?? null,
      };
    }

    return {
      youtubeUrl: item.youtubeUrl,
      title: item.title ?? '',
      description: item.description ?? '',
      sectionId: item.sectionId ?? null,
    };
  });

  formData.append('payload', JSON.stringify({ materials }));

  return request<{ materials: LessonMaterial[] }>(`/api/lessons/${encodeURIComponent(lessonId)}/materials`, {
    method: 'POST',
    body: formData,
  });
}

export async function updateLessonMaterial(materialId: string, payload: { title: string; description?: string; sectionId?: string | null; replacementFile?: File | null; replacementFileVideoDurationSeconds?: number | null; youtubeUrl?: string }) {
  if (payload.replacementFile) {
    const formData = new FormData();
    formData.append('replacementFile', payload.replacementFile, payload.replacementFile.name);
    formData.append('payload', JSON.stringify({
      title: payload.title,
      description: payload.description ?? '',
      sectionId: payload.sectionId ?? null,
      replacementFile: {
        fileField: 'replacementFile',
        originalName: payload.replacementFile.name,
        mimeType: payload.replacementFile.type,
        videoDurationSeconds: payload.replacementFileVideoDurationSeconds ?? null,
      },
      youtubeUrl: payload.youtubeUrl ?? '',
    }));

    return request<{ material: LessonMaterial }>(`/api/materials/${encodeURIComponent(materialId)}`, {
      method: 'PUT',
      body: formData,
    });
  }

  return request<{ material: LessonMaterial }>(`/api/materials/${encodeURIComponent(materialId)}`, {
    method: 'PUT',
    body: {
      title: payload.title,
      description: payload.description ?? '',
      sectionId: payload.sectionId ?? null,
      replacementFile: null,
      youtubeUrl: payload.youtubeUrl ?? '',
    },
  });
}

export function createLessonMaterialSection(lessonId: string, payload: { title: string; description?: string; isPaidContent?: boolean }) {
  return request<{ section: LessonMaterialSection }>(`/api/lessons/${encodeURIComponent(lessonId)}/material-sections`, {
    method: 'POST',
    body: payload,
  });
}

export function updateLessonMaterialSection(sectionId: string, payload: { title: string; description?: string; isPaidContent?: boolean }) {
  return request<{ section: LessonMaterialSection }>(`/api/material-sections/${encodeURIComponent(sectionId)}`, {
    method: 'PUT',
    body: payload,
  });
}

export function removeLessonMaterialSection(sectionId: string) {
  return request<{ removed: true }>(`/api/material-sections/${encodeURIComponent(sectionId)}/remove`, {
    method: 'POST',
  });
}

export function saveLessonMaterialLayout(lessonId: string, items: Array<{ id: string; sectionId?: string | null }>) {
  return request<{ saved: true }>(`/api/lessons/${encodeURIComponent(lessonId)}/materials/layout`, {
    method: 'POST',
    body: { items },
  });
}

export function reorderLessonMaterial(materialId: string, direction: 'up' | 'down') {
  return request<{ moved: boolean }>(`/api/materials/${encodeURIComponent(materialId)}/reorder`, {
    method: 'POST',
    body: { direction },
  });
}

export function removeLessonMaterial(materialId: string) {
  return request<{ removed: true }>(`/api/materials/${encodeURIComponent(materialId)}/remove`, {
    method: 'POST',
  });
}

export async function uploadLearnerCourseMaterial(courseId: string, payload: { file: File; title?: string; description?: string }) {
  return request<{ material: LearnerCourseMaterial }>(`/api/courses/${encodeURIComponent(courseId)}/learner-materials`, {
    method: 'POST',
    body: {
      title: payload.title ?? '',
      description: payload.description ?? '',
      file: {
        originalName: payload.file.name,
        mimeType: payload.file.type,
        base64Data: await fileToBase64(payload.file),
      },
    },
  });
}

export function createLessonQuiz(lessonId: string, payload: CreateLessonQuizInput) {
  return request<{ quiz: LessonQuiz }>(`/api/lessons/${encodeURIComponent(lessonId)}/quiz`, {
    method: 'POST',
    body: payload,
  });
}

export function generateLessonQuizDraft(lessonId: string, payload: GenerateLessonQuizDraftInput) {
  return request<{ draft: GeneratedLessonQuizDraft }>(`/api/lessons/${encodeURIComponent(lessonId)}/quiz/generate`, {
    method: 'POST',
    body: payload,
  });
}

export function publishCourse(courseId: string) {
  return request<{ published: true }>(`/api/courses/${encodeURIComponent(courseId)}/publish`, {
    method: 'POST',
  });
}

export function unpublishCourse(courseId: string) {
  return request<{ unpublished: true }>(`/api/courses/${encodeURIComponent(courseId)}/unpublish`, {
    method: 'POST',
  });
}

export function enrollInCourse(courseId: string) {
  return request<{ enrolled: true }>(`/api/courses/${encodeURIComponent(courseId)}/enroll`, {
    method: 'POST',
  });
}

export function submitQuizAttempt(quizId: string, payload: SubmitQuizAttemptInput) {
  return request<{ attempt: QuizAttemptSummary }>(`/api/quizzes/${encodeURIComponent(quizId)}/attempts`, {
    method: 'POST',
    body: payload,
  });
}
