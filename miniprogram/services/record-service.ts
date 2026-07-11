import type { RequestInit } from '../types/api';
import type { RecordDetail, RecordSummary } from '../types/record';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

export const createRecordService = (options: { request: RequestFunction }) => ({
  list: () => options.request<RecordSummary[]>('/api/dinner/records'),
  detail: (recordId: number) =>
    options.request<RecordDetail>(`/api/dinner/records/${recordId}`),
});
