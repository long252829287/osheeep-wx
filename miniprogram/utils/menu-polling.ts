type TimerHandle = ReturnType<typeof setInterval>;

interface PollingScheduler {
  setInterval: (callback: () => void, milliseconds: number) => TimerHandle;
  clearInterval: (timer: TimerHandle) => void;
}

export const startMenuPolling = (
  load: () => void | Promise<unknown>,
  scheduler: PollingScheduler,
  intervalMilliseconds = 8000,
) => {
  void load();
  const timer = scheduler.setInterval(() => void load(), intervalMilliseconds);
  return () => scheduler.clearInterval(timer);
};
