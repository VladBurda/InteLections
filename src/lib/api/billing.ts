import type { User } from '../../types/user';
import { request } from './core';

export function createIntelectionsPlusCheckout() {
  return request<{ url?: string; bypassed?: boolean; alreadyActive?: boolean }>('/api/billing/intelections-plus/checkout', {
    method: 'POST',
  });
}

export function openBillingPortal() {
  return request<{ url?: string; bypassed?: boolean }>('/api/billing/portal', {
    method: 'POST',
  });
}

export function linkExistingPlusToStripe() {
  return request<{ linked?: boolean; customerId?: string; message?: string; bypassed?: boolean; url?: string }>('/api/billing/link-existing-plus', {
    method: 'POST',
  });
}

export function startSellerConnectOnboarding() {
  return request<{ url?: string; state?: { sellerBillingReady: boolean; connectedAccountStatus: 'not_connected' | 'pending' | 'ready' } }>('/api/billing/seller-connect/onboarding', {
    method: 'POST',
  });
}

export function syncSellerConnectStatus() {
  return request<{ user: User }>('/api/billing/seller-connect/sync', {
    method: 'POST',
  });
}

export function createCourseCheckout(courseId: string) {
  return request<{ url?: string; bypassed?: boolean; alreadyPurchased?: boolean; purchaseStatus?: 'none' | 'pending' | 'paid' | 'failed' }>(`/api/courses/${encodeURIComponent(courseId)}/checkout`, {
    method: 'POST',
  });
}
