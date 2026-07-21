import type { MenuDish, MenuDishSource, TodayMenu } from '../types/menu';

export interface RandomValuesPort {
  (options: {
    length: number;
    success?: (result: { randomValues: ArrayBuffer; errMsg: string }) => void;
    fail?: (error: { errMsg: string }) => void;
  }): void;
}

export type MenuPrimaryAction = {
  kind: 'confirm' | 'complete' | 'record';
  label: string;
  disabled: boolean;
};

export const getSourcePresentation = (source: MenuDishSource) => {
  const presentations = {
    ME: { label: '我想吃', tone: 'mine' },
    PARTNER: { label: 'TA 想吃', tone: 'partner' },
    BOTH: { label: '都想吃', tone: 'both' },
  } as const;
  return presentations[source];
};

export const toMenuDishPresentation = (dish: MenuDish) => {
  const source = getSourcePresentation(dish.source);
  return {
    ...dish,
    sourceLabel: source.label,
    sourceTone: source.tone,
    contextLabel:
      dish.scope === 'HOUSEHOLD'
        ? `自家菜谱${dish.method ? ` · ${dish.method.name}` : ''}`
        : '',
  };
};

export const getMenuPrimaryAction = (menu: TodayMenu): MenuPrimaryAction => {
  if (menu.status === 'COMPLETED') {
    return { kind: 'record', label: '查看本次记录', disabled: !menu.recordId };
  }
  if (menu.status === 'CONFIRMED') {
    return { kind: 'complete', label: '已做完，生成记录', disabled: false };
  }
  return {
    kind: 'confirm',
    label: '确认今晚菜单',
    disabled: menu.dishes.length === 0,
  };
};

export const createIdempotencyKey = async (
  getRandomValues: RandomValuesPort = (options) => wx.getRandomValues(options),
) => {
  const bytes = await randomBytes(getRandomValues);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
};

const randomBytes = (getRandomValues: RandomValuesPort) =>
  new Promise<Uint8Array>((resolve) => {
    getRandomValues({
      length: 16,
      success: (result) => resolve(new Uint8Array(result.randomValues)),
      fail: () =>
        resolve(
          Uint8Array.from({ length: 16 }, () =>
            Math.floor(Math.random() * 256),
          ),
        ),
    });
  });
