import { request } from './core';

export function getAiStatus() {
  return request<{
    configured: boolean;
    quizGenerationAvailable: boolean;
    reason: string;
    model: string | null;
  }>('/api/ai/status');
}

export function getDemoStatus() {
  return request<{
    environment: string;
    demoPasswordConfigured: boolean;
    defaultDemoPassword: string;
    ai: { configured: boolean; model: string | null };
    billing: { stripeConfigured: boolean; webhookConfigured: boolean; sellerMarketplaceFeePercent: number; testModeExpected: boolean };
    oauth: { googleConfigured: boolean };
  }>('/api/demo-status');
}
