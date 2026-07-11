import type { RequestInit } from '../types/api';
import type {
  HouseholdCreatedResult,
  HouseholdSummary,
} from '../types/household';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

const normalizeInviteCode = (value: string) => {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return compact.length > 6
    ? `${compact.slice(0, 6)} ${compact.slice(6)}`
    : compact;
};

export const createHouseholdService = (options: {
  request: RequestFunction;
}) => ({
  getCurrent: async (): Promise<HouseholdSummary | null> =>
    (await options.request<HouseholdSummary | undefined>(
      '/api/dinner/household',
    )) ?? null,

  create: (name = '我们的小家') =>
    options.request<HouseholdCreatedResult>('/api/dinner/households', {
      method: 'POST',
      data: { name },
    }),

  refreshInviteCode: () =>
    options.request<HouseholdCreatedResult>(
      '/api/dinner/households/invite-code/refresh',
      { method: 'POST' },
    ),

  join: (inviteCode: string) =>
    options.request<HouseholdSummary>('/api/dinner/households/join', {
      method: 'POST',
      data: { inviteCode: normalizeInviteCode(inviteCode) },
    }),
});
