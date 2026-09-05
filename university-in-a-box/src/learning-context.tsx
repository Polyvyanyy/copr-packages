import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  createInitialState,
  mergeActivityDateLedger,
  parseLearningState,
  STORAGE_KEY,
} from './domain/progress';
import type { LearningState } from './domain/types';

interface LearningContextValue {
  state: LearningState;
  setState: Dispatch<SetStateAction<LearningState>>;
  storageError: string | null;
  notice: string | null;
  notify: (message: string) => void;
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

export function LearningProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readSavedState);
  const [state, setStoredState] = useState(initial.state);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [notice, notify] = useState<string | null>(null);
  const setState = useCallback<Dispatch<SetStateAction<LearningState>>>((update) => {
    setStoredState((previous) => {
      if (typeof update !== 'function') return update;
      return mergeActivityDateLedger(previous, update(previous));
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(null);
    } catch {
      setStorageError(
        'Хранилище недоступно. Не закрывайте вкладку: экспортируйте результаты на странице прогресса.',
      );
    }
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const value = useMemo(
    () => ({ state, setState, storageError, notice, notify }),
    [state, setState, storageError, notice],
  );
  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning() {
  const context = useContext(LearningContext);
  if (!context) throw new Error('LearningProvider is required');
  return context;
}
