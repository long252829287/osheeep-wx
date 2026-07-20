import { ApiError } from '../miniprogram/services/request';
import { createRecipeAutosave } from '../miniprogram/utils/recipe-autosave';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  jest.useRealTimers();
});

test('debounces 800ms and serializes edits made during an in-flight save', async () => {
  jest.useFakeTimers();
  const first = deferred<{ version: number }>();
  const save = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ version: 3 });
  let version = 1;
  const autosave = createRecipeAutosave<string>({
    delayMs: 800,
    getVersion: () => version,
    save: (value, expectedVersion) => save(value, expectedVersion),
    onVersion: (next) => {
      version = next;
    },
    onState: jest.fn(),
  });

  autosave.schedule('first');
  await jest.advanceTimersByTimeAsync(800);
  autosave.schedule('second');
  first.resolve({ version: 2 });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(800);

  expect(save).toHaveBeenNthCalledWith(1, 'first', 1);
  expect(save).toHaveBeenNthCalledWith(2, 'second', 2);
});

test('flush runs a scheduled latest snapshot immediately', async () => {
  jest.useFakeTimers();
  const save = jest.fn().mockResolvedValue({ version: 2 });
  const autosave = createRecipeAutosave<string>({
    delayMs: 800,
    getVersion: () => 1,
    save,
    onVersion: jest.fn(),
    onState: jest.fn(),
  });

  autosave.schedule('draft');
  await autosave.flush();
  await jest.advanceTimersByTimeAsync(800);

  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('draft', 1);
  expect(autosave.state()).toBe('saved');
});

test('flush saves the latest in-flight edit once without a leftover timer', async () => {
  jest.useFakeTimers();
  const first = deferred<{ version: number }>();
  const save = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ version: 3 });
  let version = 1;
  const autosave = createRecipeAutosave<string>({
    delayMs: 800,
    getVersion: () => version,
    save: (value, expectedVersion) => save(value, expectedVersion),
    onVersion: (next) => {
      version = next;
    },
    onState: jest.fn(),
  });

  autosave.schedule('first');
  await jest.advanceTimersByTimeAsync(800);
  autosave.schedule('second');
  const flushing = autosave.flush();
  first.resolve({ version: 2 });
  await flushing;
  await jest.advanceTimersByTimeAsync(800);

  expect(save).toHaveBeenNthCalledWith(1, 'first', 1);
  expect(save).toHaveBeenNthCalledWith(2, 'second', 2);
  expect(save).toHaveBeenCalledTimes(2);
});

test('ordinary save errors retain the snapshot and retry only when requested', async () => {
  const save = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ version: 2 });
  const autosave = createRecipeAutosave<{ name: string }>({
    delayMs: 800,
    getVersion: () => 1,
    save,
    onVersion: jest.fn(),
    onState: jest.fn(),
  });
  autosave.schedule({ name: '本地菜名' });

  await expect(autosave.flush()).rejects.toThrow('offline');
  expect(autosave.snapshot()).toEqual({ name: '本地菜名' });
  expect(autosave.state()).toBe('error');
  expect(save).toHaveBeenCalledTimes(1);

  await autosave.retry();
  expect(save).toHaveBeenCalledTimes(2);
  expect(autosave.state()).toBe('saved');
});

test('conflict stops automatic retries and keeps the latest snapshot', async () => {
  const save = jest
    .fn()
    .mockRejectedValue(new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'));
  const autosave = createRecipeAutosave<{ name: string }>({
    delayMs: 800,
    getVersion: () => 1,
    save,
    onVersion: jest.fn(),
    onState: jest.fn(),
  });
  autosave.schedule({ name: '本地菜名' });

  await expect(autosave.flush()).rejects.toMatchObject({
    errorCode: 'DINNER_RECIPE_VERSION_CONFLICT',
  });
  expect(autosave.snapshot()).toEqual({ name: '本地菜名' });
  expect(autosave.state()).toBe('conflict');
  expect(save).toHaveBeenCalledTimes(1);
});

test('dispose cancels a pending timer without leaving a delayed save', async () => {
  jest.useFakeTimers();
  const save = jest.fn().mockResolvedValue({ version: 2 });
  const autosave = createRecipeAutosave<string>({
    delayMs: 800,
    getVersion: () => 1,
    save,
    onVersion: jest.fn(),
    onState: jest.fn(),
  });

  autosave.schedule('discarded');
  autosave.dispose();
  await jest.advanceTimersByTimeAsync(800);
  await autosave.flush();

  expect(save).not.toHaveBeenCalled();
  expect(autosave.state()).toBe('idle');
});
