import type { ConnectedAccountStatus, SubscriptionPlan, User } from '../../types/user';
import { request, fileToBase64 } from './core';

export function getMe() {
  return request<User>('/api/me');
}

export function updateMe(payload: Partial<User>) {
  return request<User>('/api/me', {
    method: 'PUT',
    body: payload,
  });
}

export function updateMyRole(role: User['role']) {
  return request<{ role: User['role'] }>('/api/me/role', {
    method: 'POST',
    body: { role },
  });
}

export async function uploadAvatar(file: File) {
  const base64Data = await fileToBase64(file);
  return request<{ avatarUrl: string }>('/api/me/avatar', {
    method: 'POST',
    body: {
      mimeType: file.type,
      base64Data,
    },
  });
}

export function getProfile(profileId: string) {
  return request<User>(`/api/profiles/${encodeURIComponent(profileId)}`);
}

export function setUserProfileVisibility(userId: string, payload: { blocked: boolean }) {
  return request<{ blocked: boolean; user: User }>(`/api/admin/users/${encodeURIComponent(userId)}/profile-visibility`, {
    method: 'POST',
    body: payload,
  });
}

export type SellerConnectResponse = {
  url?: string;
  state?: { sellerBillingReady: boolean; connectedAccountStatus: ConnectedAccountStatus };
};

export type BillingPortalResponse = {
  url?: string;
  bypassed?: boolean;
};

export type IntelectionsPlusCheckoutResponse = {
  url?: string;
  bypassed?: boolean;
  alreadyActive?: boolean;
};

export type ExistingPlusLinkResponse = {
  linked?: boolean;
  customerId?: string;
  message?: string;
  bypassed?: boolean;
  url?: string;
};

export function updateMySubscription(plan: SubscriptionPlan) {
  return request<{ subscriptionPlan: SubscriptionPlan }>('/api/me/subscription', {
    method: 'POST',
    body: { plan },
  });
}
