import { ApiError } from '../services/request';

export type RecipeAutosaveState =
  'idle' | 'scheduled' | 'saving' | 'saved' | 'error' | 'conflict';

export interface RecipeAutosave<T> {
  schedule(value: T): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  dispose(): void;
  snapshot(): T | undefined;
  state(): RecipeAutosaveState;
}

export interface RecipeAutosaveOptions<T> {
  delayMs?: number;
  getVersion(): number;
  save(value: T, expectedVersion: number): Promise<{ version: number }>;
  onVersion(nextVersion: number): void;
  onState(state: RecipeAutosaveState): void;
}

const isVersionConflict = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.errorCode === 'DINNER_RECIPE_VERSION_CONFLICT';

export const createRecipeAutosave = <T>(
  options: RecipeAutosaveOptions<T>,
): RecipeAutosave<T> => {
  const delayMs = options.delayMs ?? 800;
  let latest: T | undefined;
  let latestGeneration = 0;
  let savedGeneration = -1;
  let currentState: RecipeAutosaveState = 'idle';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let lastError: unknown;
  let disposed = false;

  const setState = (next: RecipeAutosaveState): void => {
    currentState = next;
    options.onState(next);
  };

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const scheduleTimer = (): void => {
    if (disposed || inFlight || currentState === 'conflict') return;
    clearTimer();
    setState('scheduled');
    timer = setTimeout(() => {
      timer = undefined;
      void startSave().catch(() => undefined);
    }, delayMs);
  };

  const startSave = (): Promise<void> => {
    if (
      disposed ||
      latest === undefined ||
      latestGeneration === savedGeneration
    ) {
      return Promise.resolve();
    }
    if (inFlight) return inFlight;

    const value = latest;
    const generation = latestGeneration;
    const expectedVersion = options.getVersion();
    let saveSucceeded = false;
    setState('saving');
    const promise = options
      .save(value, expectedVersion)
      .then((result) => {
        if (disposed) return;
        savedGeneration = generation;
        lastError = undefined;
        saveSucceeded = true;
        options.onVersion(result.version);
        setState('saved');
      })
      .catch((error: unknown) => {
        if (!disposed) {
          lastError = error;
          setState(isVersionConflict(error) ? 'conflict' : 'error');
        }
        throw error;
      })
      .finally(() => {
        if (inFlight === promise) inFlight = undefined;
        if (
          !disposed &&
          saveSucceeded &&
          currentState !== 'conflict' &&
          latestGeneration !== savedGeneration
        ) {
          scheduleTimer();
        }
      });
    inFlight = promise;
    return promise;
  };

  const flushLatest = (): Promise<void> => {
    clearTimer();
    if (
      disposed ||
      latest === undefined ||
      latestGeneration === savedGeneration
    ) {
      return Promise.resolve();
    }
    if (currentState === 'conflict') {
      return Promise.reject(lastError);
    }
    return startSave();
  };

  return {
    schedule: (value: T): void => {
      if (disposed) return;
      latest = value;
      latestGeneration += 1;
      if (currentState !== 'conflict') scheduleTimer();
    },
    flush: (): Promise<void> => {
      if (disposed) return Promise.resolve();
      clearTimer();
      if (!inFlight) return flushLatest();
      return inFlight.then(flushLatest);
    },
    retry: (): Promise<void> => {
      if (disposed || latest === undefined) return Promise.resolve();
      clearTimer();
      lastError = undefined;
      if (currentState === 'conflict' || currentState === 'error')
        setState('idle');
      if (!inFlight) return flushLatest();
      return inFlight.then(flushLatest);
    },
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      clearTimer();
      setState('idle');
    },
    snapshot: (): T | undefined => latest,
    state: (): RecipeAutosaveState => currentState,
  };
};
