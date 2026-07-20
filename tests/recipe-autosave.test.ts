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

test('conflict blocks scheduled edits until retry uses a fresh version', async () => {
  jest.useFakeTimers();
  let version = 1;
  const save = jest
    .fn()
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({ version: 8 });
  const autosave = createRecipeAutosave<string>({
    delayMs: 800,
    getVersion: () => version,
    save,
    onVersion: jest.fn(),
    onState: jest.fn(),
  });

  autosave.schedule('before-conflict');
  await expect(autosave.flush()).rejects.toMatchObject({
    errorCode: 'DINNER_RECIPE_VERSION_CONFLICT',
  });
  version = 7;
  autosave.schedule('after-conflict');
  await jest.advanceTimersByTimeAsync(800);
  expect(save).toHaveBeenCalledTimes(1);

  await autosave.retry();
  expect(save).toHaveBeenNthCalledWith(2, 'after-conflict', 7);
});

test('sync getVersion and save throws reject flush and leave an error state', async () => {
  const getVersionError = new Error('version unavailable');
  const getVersionAutosave = createRecipeAutosave<string>({
    getVersion: () => {
      throw getVersionError;
    },
    save: jest.fn(),
    onVersion: jest.fn(),
    onState: jest.fn(),
  });
  getVersionAutosave.schedule('draft');
  await expect(getVersionAutosave.flush()).rejects.toBe(getVersionError);
  expect(getVersionAutosave.state()).toBe('error');

  const saveError = new Error('save unavailable');
  const saveAutosave = createRecipeAutosave<string>({
    getVersion: () => 1,
    save: () => {
      throw saveError;
    },
    onVersion: jest.fn(),
    onState: jest.fn(),
  });
  saveAutosave.schedule('draft');
  await expect(saveAutosave.flush()).rejects.toBe(saveError);
  expect(saveAutosave.state()).toBe('error');
});

test('timer failures, late disposal, and observer failures do not escape or reverse saves', async () => {
  jest.useFakeTimers();
  const timerAutosave = createRecipeAutosave<string>({
    getVersion: () => 1,
    save: () => {
      throw new Error('timer failure');
    },
    onVersion: jest.fn(),
    onState: jest.fn(),
  });
  timerAutosave.schedule('timer');
  await jest.advanceTimersByTimeAsync(800);
  expect(timerAutosave.state()).toBe('error');

  const version = 1;
  const observerSave = jest
    .fn()
    .mockResolvedValueOnce({ version: 2 })
    .mockResolvedValueOnce({ version: 3 });
  const observerAutosave = createRecipeAutosave<string>({
    getVersion: () => version,
    save: observerSave,
    onVersion: () => {
      throw new Error('observer version failure');
    },
    onState: () => {
      throw new Error('observer state failure');
    },
  });
  observerAutosave.schedule('first');
  await observerAutosave.flush();
  observerAutosave.schedule('second');
  await observerAutosave.flush();
  expect(observerAutosave.state()).toBe('saved');
  expect(observerSave).toHaveBeenNthCalledWith(1, 'first', 1);
  expect(observerSave).toHaveBeenNthCalledWith(2, 'second', 2);

  const late = deferred<{ version: number }>();
  const onVersion = jest.fn();
  const disposedAutosave = createRecipeAutosave<string>({
    getVersion: () => version,
    save: () => late.promise,
    onVersion,
    onState: jest.fn(),
  });
  disposedAutosave.schedule('late');
  await jest.advanceTimersByTimeAsync(800);
  disposedAutosave.dispose();
  late.reject(new Error('late failure'));
  await Promise.resolve();
  await Promise.resolve();
  expect(disposedAutosave.state()).toBe('idle');
  expect(onVersion).not.toHaveBeenCalled();

  const lateSuccess = deferred<{ version: number }>();
  const lateSuccessOnVersion = jest.fn();
  const disposedSuccessAutosave = createRecipeAutosave<string>({
    getVersion: () => version,
    save: () => lateSuccess.promise,
    onVersion: lateSuccessOnVersion,
    onState: jest.fn(),
  });
  disposedSuccessAutosave.schedule('late success');
  await jest.advanceTimersByTimeAsync(800);
  disposedSuccessAutosave.dispose();
  lateSuccess.resolve({ version: 3 });
  await Promise.resolve();
  await Promise.resolve();
  expect(disposedSuccessAutosave.state()).toBe('idle');
  expect(lateSuccessOnVersion).not.toHaveBeenCalled();
});

test('concurrent flush and retry share one in-flight save', async () => {
  const pending = deferred<{ version: number }>();
  const save = jest.fn(() => pending.promise);
  const autosave = createRecipeAutosave<string>({
    getVersion: () => 1,
    save,
    onVersion: jest.fn(),
    onState: jest.fn(),
  });
  autosave.schedule('draft');

  const flushing = autosave.flush();
  const retrying = autosave.retry();
  pending.resolve({ version: 2 });
  await Promise.all([flushing, retrying]);

  expect(save).toHaveBeenCalledTimes(1);
  expect(autosave.state()).toBe('saved');
});
