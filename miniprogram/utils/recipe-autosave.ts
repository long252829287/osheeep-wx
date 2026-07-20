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
  dirty(): boolean;
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
  let serverVersion: number | undefined;
  let disposed = false;

  const setState = (next: RecipeAutosaveState): void => {
    if (currentState === next) return;
    currentState = next;
    try {
      options.onState(next);
    } catch {
      // State observers must not affect persistence.
    }
  };

  const notifyVersion = (nextVersion: number): void => {
    try {
      options.onVersion(nextVersion);
    } catch {
      // Version observers must not affect persistence.
    }
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
    const scheduledTimer = setTimeout(() => {
      if (timer !== scheduledTimer) return;
      timer = undefined;
      void startSave().catch(() => undefined);
    }, delayMs);
    timer = scheduledTimer;
    setState('scheduled');
  };

  const validVersion = (version: number | undefined): version is number =>
    typeof version === 'number' && Number.isFinite(version) && version >= 1;

  const expectedVersion = (): number => {
    try {
      const sharedVersion = options.getVersion();
      if (validVersion(sharedVersion) && validVersion(serverVersion)) {
        return Math.max(sharedVersion, serverVersion);
      }
      if (validVersion(sharedVersion)) return sharedVersion;
      if (validVersion(serverVersion)) return serverVersion;
      throw new Error('Recipe version is unavailable');
    } catch (error) {
      if (validVersion(serverVersion)) return serverVersion;
      throw error;
    }
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
    let saveSucceeded = false;
    const promise = Promise.resolve()
      .then(() => {
        return options.save(value, expectedVersion());
      })
      .then((result) => {
        if (disposed) return;
        savedGeneration = generation;
        serverVersion = validVersion(serverVersion)
          ? Math.max(serverVersion, result.version)
          : result.version;
        lastError = undefined;
        saveSucceeded = true;
        notifyVersion(result.version);
        setState('saved');
      })
      .catch((error: unknown) => {
        if (!disposed) {
          lastError = error;
          if (isVersionConflict(error)) serverVersion = undefined;
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
    setState('saving');
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
      const retryLatest = (): Promise<void> => {
        clearTimer();
        lastError = undefined;
        if (currentState === 'conflict' || currentState === 'error') {
          setState('idle');
        }
        return flushLatest();
      };
      if (!inFlight) return retryLatest();
      return inFlight.then(retryLatest, retryLatest);
    },
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      clearTimer();
      setState('idle');
    },
    snapshot: (): T | undefined => latest,
    state: (): RecipeAutosaveState => currentState,
    dirty: (): boolean =>
      !disposed && latest !== undefined && latestGeneration !== savedGeneration,
  };
};
