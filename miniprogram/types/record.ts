import type { MenuDish } from './menu';

export interface RecordSummary {
  id: number;
  recordDate: string;
  completedBy: number;
  completedAt: string;
  dishCount: number;
}

export interface RecordDetail {
  id: number;
  recordDate: string;
  completedBy: number;
  completedAt: string;
  dishes: MenuDish[];
}
