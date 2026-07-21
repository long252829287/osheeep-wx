import { ApiError } from '../../services/request';
import type { HouseholdSummary } from '../../types/household';
import type { TodayMenu } from '../../types/menu';
import { toMenuErrorMessage } from '../../utils/menu-errors';
import { startMenuPolling } from '../../utils/menu-polling';
import {
  createIdempotencyKey,
  toMenuDishPresentation,
} from '../../utils/menu-state';

interface OsheeepApp {
  getHousehold: () => Promise<HouseholdSummary | null>;
  getTodayMenu: () => Promise<TodayMenu>;
  confirmTodayMenu: (version: number, key: string) => Promise<TodayMenu>;
  completeTodayMenu: (
    version: number,
    key: string,
  ) => Promise<{ recordId: number; menu: TodayMenu }>;
}

type DishView = ReturnType<typeof toMenuDishPresentation>;

let stopPolling: (() => void) | undefined;
const stickyConflictNotices = new WeakMap<object, string>();

const toDishViews = (dishes: TodayMenu['dishes']): DishView[] =>
  dishes.map(toMenuDishPresentation);

Page({
  data: {
    loading: true,
    household: null as HouseholdSummary | null,
    menu: null as TodayMenu | null,
    dishes: [] as DishView[],
    errorMessage: '',
    noticeMessage: '',
    actionPending: false,
  },

  onShow() {
    stopPolling?.();
    stopPolling = startMenuPolling(() => this.loadMenu(), {
      setInterval,
      clearInterval,
    });
  },

  onHide() {
    stopPolling?.();
    stopPolling = undefined;
  },

  onUnload() {
    stopPolling?.();
    stopPolling = undefined;
    stickyConflictNotices.delete(this);
  },

  async loadMenu() {
    const hasSnapshot = Boolean(this.data.menu);
    if (!hasSnapshot) this.setData({ loading: true, errorMessage: '' });
    try {
      const app = getApp<OsheeepApp>();
      const [household, menu] = await Promise.all([
        this.data.household
          ? Promise.resolve(this.data.household)
          : app.getHousehold(),
        app.getTodayMenu(),
      ]);
      if (!household) {
        wx.reLaunch({ url: '/pages/household-create/index' });
        return;
      }
      this.setData({
        household,
        menu,
        dishes: toDishViews(menu.dishes),
        errorMessage: '',
        noticeMessage: stickyConflictNotices.get(this) ?? '',
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? toMenuErrorMessage(error.errorCode)
          : '菜单加载失败，请稍后重试';
      this.setData(
        hasSnapshot ? { noticeMessage: message } : { errorMessage: message },
      );
    } finally {
      this.setData({ loading: false });
    }
  },

  onChooseRecipes() {
    wx.navigateTo({ url: '/pages/recipes/index' });
  },

  async onConfirmMenu() {
    const menu = this.data.menu;
    if (!menu || menu.dishes.length === 0 || this.data.actionPending) return;
    stickyConflictNotices.delete(this);
    this.setData({ actionPending: true, noticeMessage: '' });
    try {
      const key = await createIdempotencyKey();
      const next = await getApp<OsheeepApp>().confirmTodayMenu(
        menu.version,
        key,
      );
      this.setData({ menu: next, dishes: toDishViews(next.dishes) });
    } catch (error) {
      this.handleActionError(error);
    } finally {
      this.setData({ actionPending: false });
    }
  },

  async onCompleteMenu() {
    const menu = this.data.menu;
    if (!menu || this.data.actionPending) return;
    stickyConflictNotices.delete(this);
    this.setData({ actionPending: true, noticeMessage: '' });
    try {
      const key = await createIdempotencyKey();
      const result = await getApp<OsheeepApp>().completeTodayMenu(
        menu.version,
        key,
      );
      this.setData({
        menu: result.menu,
        dishes: toDishViews(result.menu.dishes),
      });
      wx.navigateTo({
        url: `/pages/record-detail/index?id=${result.recordId}`,
      });
    } catch (error) {
      this.handleActionError(error);
    } finally {
      this.setData({ actionPending: false });
    }
  },

  handleActionError(error: unknown) {
    const message =
      error instanceof ApiError
        ? toMenuErrorMessage(error.errorCode)
        : '操作失败，请稍后重试';
    const isVersionConflict =
      error instanceof ApiError &&
      error.errorCode === 'DINNER_MENU_VERSION_CONFLICT';
    if (isVersionConflict) {
      stickyConflictNotices.set(this, message);
    }
    this.setData({ noticeMessage: message });
    if (isVersionConflict) void this.loadMenu();
  },

  onOpenRecord() {
    const recordId = this.data.menu?.recordId;
    if (recordId)
      wx.navigateTo({ url: `/pages/record-detail/index?id=${recordId}` });
  },
});
