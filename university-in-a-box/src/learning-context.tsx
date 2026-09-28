import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  createInitialState,
  mergeActivityDateLedger,
  parseLearningState,
  STORAGE_KEY,
} from './domain/progress';
import type { LearningState } from './domain/types';
import { ApiError, apiRequest, errorMessage } from './product-api';
import type { LearningEnvelope } from './product-types';

type SyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'offline' | 'conflict';

interface LearningContextValue {
  state: LearningState;
  setState: Dispatch<SetStateAction<LearningState>>;
  storageError: string | null;
  notice: string | null;
  notify: (message: string) => void;
  syncStatus: SyncStatus;
  updatedAt: string | null;
  cloudReady: boolean;
  flush: () => Promise<boolean>;
  resetProgress: () => Promise<boolean>;
  reloadCloud: () => Promise<void>;
  resolveConflict: (choice: 'server' | 'local') => void;
}

const LearningContext = createContext<LearningContextValue | null>(null);

function readSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { state: saved ? parseLearningState(saved) : createInitialState(), error: null };
  } catch {
    return {
      state: createInitialState(),
      error:
        'Не удалось прочитать локальные данные. Новые результаты пока доступны в этой вкладке.',
    };
  }
}

export function LearningProvider({
  children,
  accountId,
}: {
  children: ReactNode;
  accountId?: string;
}) {
  const [initial] = useState(() =>
    accountId ? { state: createInitialState(), error: null } : readSavedState(),
  );
  const [state, setStoredState] = useState(initial.state);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [notice, notify] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(accountId ? 'loading' : 'local');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(!accountId);
  const revision = useRef<number | null>(null);
  const saved = useRef(JSON.stringify(initial.state));
  const current = useRef(initial.state);
  const conflict = useRef<LearningEnvelope | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const resetting = useRef(false);
  const alive = useRef(true);
  const loadGeneration = useRef(0);
  const setState = useCallback<Dispatch<SetStateAction<LearningState>>>((update) => {
    if (resetting.current) {
      notify('Дождитесь завершения сброса данных');
      return;
    }
    const previous = current.current;
    const next =
      typeof update === 'function' ? mergeActivityDateLedger(previous, update(previous)) : update;
    current.current = next;
    setStoredState(next);
  }, []);

  const acceptCloud = useCallback((envelope: LearningEnvelope) => {
    const next = parseLearningState(envelope.state);
    revision.current = envelope.revision;
    saved.current = JSON.stringify(next);
    current.current = next;
    conflict.current = null;
    setStoredState(next);
    setUpdatedAt(envelope.updatedAt);
    setCloudReady(true);
    setStorageError(null);
    setSyncStatus('synced');
  }, []);

  const reloadCloud = useCallback(async () => {
    if (!accountId) return;
    const request = ++loadGeneration.current;
    setSyncStatus('loading');
    try {
      const envelope = await apiRequest<LearningEnvelope>('/api/learning', { accountId });
      if (alive.current && request === loadGeneration.current) acceptCloud(envelope);
    } catch (error) {
      if (!alive.current || request !== loadGeneration.current) return;
      setSyncStatus('offline');
      setStorageError(errorMessage(error));
    }
  }, [accountId, acceptCloud]);

  const reportCloudError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.code === 'REVISION_CONFLICT' && error.current) {
      conflict.current = error.current;
      setSyncStatus('conflict');
      setStorageError(
        'В другой вкладке или на другом устройстве появились изменения. Выберите, какую версию сохранить.',
      );
    } else {
      setSyncStatus('offline');
      setStorageError(
        `${errorMessage(error)} Изменения ещё в этой вкладке: не закрывайте её, пока не сохраните или не экспортируете данные.`,
      );
    }
  }, []);

  const flush = useCallback((): Promise<boolean> => {
    if (!accountId) return Promise.resolve(true);
    if (inFlight.current) return inFlight.current;
    if (revision.current === null || conflict.current || resetting.current) return Promise.resolve(false);
    const work = async () => {
      while (alive.current && !resetting.current && JSON.stringify(current.current) !== saved.current) {
        const next = current.current;
        setSyncStatus('saving');
        try {
          const envelope = await apiRequest<LearningEnvelope>('/api/learning', {
            method: 'PUT',
            accountId,
            body: { state: next, revision: revision.current },
          });
          if (!alive.current) return false;
          revision.current = envelope.revision;
          saved.current = JSON.stringify(envelope.state);
          setUpdatedAt(envelope.updatedAt);
          if (current.current === next) {
            current.current = envelope.state;
            setStoredState(envelope.state);
          }
          setStorageError(null);
        } catch (error) {
          if (!alive.current) return false;
          reportCloudError(error);
          return false;
        }
      }
      if (alive.current) setSyncStatus('synced');
      return true;
    };
    inFlight.current = work().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [accountId, reportCloudError]);

  const resetProgress = useCallback((): Promise<boolean> => {
    if (!accountId) {
      setState(createInitialState());
      return Promise.resolve(true);
    }
    if (resetting.current) return inFlight.current ?? Promise.resolve(false);
    const pendingSave = inFlight.current;
    resetting.current = true;
    const work = async () => {
      // An older in-flight save must finish before a reset can advance the revision.
      await pendingSave;
      if (!alive.current || revision.current === null || conflict.current) return false;
      setSyncStatus('saving');
      try {
        const envelope = await apiRequest<LearningEnvelope>('/api/learning', {
          method: 'DELETE',
          accountId,
          body: { revision: revision.current },
        });
        if (!alive.current) return false;
        acceptCloud(envelope);
        return true;
      } catch (error) {
        if (alive.current) reportCloudError(error);
        return false;
      }
    };
    inFlight.current = work().finally(() => {
      resetting.current = false;
      inFlight.current = null;
    });
    return inFlight.current;
  }, [accountId, acceptCloud, reportCloudError, setState]);

  const resolveConflict = useCallback(
    (choice: 'server' | 'local') => {
      const remote = conflict.current;
      if (!remote) return;
      if (choice === 'server') acceptCloud(remote);
      else {
        revision.current = remote.revision;
        conflict.current = null;
        setSyncStatus('synced');
        setStorageError(null);
      }
    },
    [acceptCloud],
  );

  useEffect(() => {
    alive.current = true;
    if (accountId) void reloadCloud();
    return () => {
      alive.current = false;
      loadGeneration.current++;
    };
  }, [accountId, reloadCloud]);

  useEffect(() => {
    if (accountId) {
      if (
        !cloudReady ||
        syncStatus === 'offline' ||
        syncStatus === 'conflict' ||
        syncStatus === 'loading'
      )
        return;
      const timer = window.setTimeout(() => void flush(), 450);
      return () => window.clearTimeout(timer);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(null);
    } catch {
      setStorageError(
        'Хранилище недоступно. Не закрывайте вкладку: экспортируйте результаты на странице прогресса.',
      );
    }
  }, [state, accountId, cloudReady, syncStatus, flush]);

  useEffect(() => {
    if (!accountId) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(current.current) === saved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onOnline = () => {
      if (revision.current === null) void reloadCloud();
      else void flush();
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', onOnline);
    };
  }, [accountId, reloadCloud, flush]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const value = useMemo(
    () => ({
      state,
      setState,
      storageError,
      notice,
      notify,
      syncStatus,
      updatedAt,
      cloudReady,
      flush,
      resetProgress,
      reloadCloud,
      resolveConflict,
    }),
    [
      state,
      setState,
      storageError,
      notice,
      syncStatus,
      updatedAt,
      cloudReady,
      flush,
      resetProgress,
      reloadCloud,
      resolveConflict,
    ],
  );
  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning() {
  const context = useContext(LearningContext);
  if (!context) throw new Error('LearningProvider is required');
  return context;
}
