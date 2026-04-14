import type { ClassDetail, ClassInviteInbox, CreateLearningGroupInput, GroupsClassesDashboard, TeacherCourseStats, TeacherClassroom } from '../../types/group';
import { request } from './core';

export function getClassDetail(classId: string) {
  return request<ClassDetail>(`/api/groups-classes/classes/${encodeURIComponent(classId)}`);
}

export function getGroupsClassesDashboard() {
  return request<GroupsClassesDashboard>('/api/groups-classes');
}

export function createLearningGroup(payload: CreateLearningGroupInput) {
  return request<{ classroom: TeacherClassroom }>('/api/groups-classes/classes', {
    method: 'POST',
    body: payload,
  });
}

export function updateLearningGroup(classId: string, payload: CreateLearningGroupInput) {
  return request<{ classroom: TeacherClassroom }>(`/api/groups-classes/classes/${encodeURIComponent(classId)}`, {
    method: 'PUT',
    body: payload,
  });
}

export function assignCourseToLearningGroup(
  classId: string,
  payload: { courseId: string; cadenceLabel?: string; dueLabel?: string },
) {
  return request<{ classroom: TeacherClassroom }>(`/api/groups-classes/classes/${encodeURIComponent(classId)}/assign-course`, {
    method: 'POST',
    body: payload,
  });
}

export function inviteUserToLearningGroup(classId: string, payload: { email: string }) {
  return request<{ invited: true }>(`/api/groups-classes/classes/${encodeURIComponent(classId)}/invites`, {
    method: 'POST',
    body: payload,
  });
}

export function joinLearningGroupByInviteCode(inviteCode: string) {
  return request<{ joined: true; className: string; groupId: string }>('/api/groups-classes/join-by-code', {
    method: 'POST',
    body: { inviteCode },
  });
}

export function getTeacherCourseStats(courseId: string) {
  return request<TeacherCourseStats>(`/api/groups-classes/courses/${encodeURIComponent(courseId)}/stats`);
}

export function getClassInviteInbox() {
  return request<ClassInviteInbox>('/api/me/class-invites');
}

export function updateClassInvitePreferences(hideClassInviteMessages: boolean) {
  return request<ClassInviteInbox>('/api/me/class-invite-preferences', {
    method: 'POST',
    body: { hideClassInviteMessages },
  });
}

export function respondToClassInvite(inviteId: string, action: 'accepted' | 'dismissed') {
  return request<{ ok: true; inbox: ClassInviteInbox }>(`/api/class-invites/${encodeURIComponent(inviteId)}/respond`, {
    method: 'POST',
    body: { action },
  });
}
