import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { ApiError, apiRequest } from './product-api';
import type { AccountSnapshot, ProductConfig } from './product-types';

interface ProductContextValue {
  account: AccountSnapshot | null;
  config: ProductConfig | null;
  status: 'loading' | 'authenticated' | 'guest' | 'unavailable';
  reload: () => Promise<AccountSnapshot | null>;
}

const ProductContext = createContext<ProductContextValue | null>(null);
const AUTH_EVENT = 'university-in-a-box:account-changed';

export function announceAccountChange() {
  try {
    localStorage.setItem(AUTH_EVENT, crypto.randomUUID());
  } catch {
    // Sessions remain server-owned even when browser storage is unavailable.
  }
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [config, setConfig] = useState<ProductConfig | null>(null);
  const [status, setStatus] = useState<ProductContextValue['status']>('loading');
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    const [settings, session] = await Promise.allSettled([
      apiRequest<ProductConfig>('/api/config'),
      apiRequest<AccountSnapshot>('/api/account'),
    ]);
    if (request !== generation.current) return null;
    if (settings.status === 'fulfilled') setConfig(settings.value);
    if (session.status === 'fulfilled') {
      setAccount(session.value);
      setStatus('authenticated');
      return session.value;
    }
    if (session.reason instanceof ApiError && session.reason.status === 401) {
      setAccount(null);
      setStatus('guest');
    } else {
      setStatus('unavailable');
    }
    return null;
  }, []);

  useEffect(() => {
    void reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_EVENT) void reload();
    };
    const onFocus = () => void reload();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      generation.current++;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  const value = useMemo(
    () => ({ account, config, status, reload }),
    [account, config, status, reload],
  );
  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct() {
  const context = useContext(ProductContext);
  if (!context) throw new Error('ProductProvider is required');
  return context;
}
