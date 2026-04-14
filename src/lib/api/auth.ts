import type { User } from '../../types/user';
import { request } from './core';

export function loginWithPassword(email: string, password: string) {
  return request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function registerWithPassword(payload: { firstName: string; lastName: string; email: string; password: string; role?: User['role'] }) {
  return request<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: payload,
  });
}

export function logoutSession() {
  return request<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function requestPasswordReset(email: string) {
  return request<{ ok: true; message: string; resetUrl?: string; expiresAt?: number }>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPasswordWithToken(payload: { token: string; password: string }) {
  return request<{ user: User }>('/api/auth/reset-password', {
    method: 'POST',
    body: payload,
  });
}

export function changePassword(payload: { currentPassword: string; newPassword: string }) {
  return request<{ ok: true; message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: payload,
  });
}

export function getAuthMe() {
  return request<{ user: User }>('/api/auth/me');
}
