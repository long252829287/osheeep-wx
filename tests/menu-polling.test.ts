import { startMenuPolling } from '../miniprogram/utils/menu-polling';

test('loads immediately, repeats every eight seconds and stops cleanly', () => {
  jest.useFakeTimers();
  const load = jest.fn();
  const scheduler = {
    setInterval: (callback: () => void, milliseconds: number) =>
      setInterval(callback, milliseconds),
    clearInterval: (timer: ReturnType<typeof setInterval>) =>
      clearInterval(timer),
  };

  const stop = startMenuPolling(load, scheduler, 8000);
  expect(load).toHaveBeenCalledTimes(1);

  jest.advanceTimersByTime(8000);
  expect(load).toHaveBeenCalledTimes(2);

  stop();
  jest.advanceTimersByTime(8000);
  expect(load).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});
