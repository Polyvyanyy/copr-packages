import { CloudOff, Download, RefreshCw } from 'lucide-react';
import { useLearning } from '../learning-context';
import { downloadJson } from '../product-api';

export function SyncBanner() {
  const { state, storageError, syncStatus, cloudReady, flush, reloadCloud, resolveConflict } =
    useLearning();
  if (!storageError && syncStatus !== 'loading') return null;
  return (
    <section className="sync-banner" role={storageError ? 'alert' : 'status'}>
      <CloudOff size={21} />
      <div>
        <strong>
          {syncStatus === 'loading'
            ? 'Загружаем ваш прогресс…'
            : syncStatus === 'conflict'
              ? 'Выберите версию данных'
              : 'Сохранение требует внимания'}
        </strong>
        {storageError && <p>{storageError}</p>}
        {syncStatus !== 'loading' && (
          <div className="form-actions">
            {syncStatus === 'conflict' ? (
              <>
                <button className="button secondary" onClick={() => resolveConflict('server')}>
                  Загрузить серверную версию
                </button>
                <button className="button secondary" onClick={() => resolveConflict('local')}>
                  Заменить серверную этой версией
                </button>
              </>
            ) : (
              syncStatus !== 'local' && (
                <button
                  className="button secondary"
                  onClick={() => void (cloudReady ? flush() : reloadCloud())}
                >
                  <RefreshCw size={15} />
                  Повторить
                </button>
              )
            )}
            {cloudReady && (
              <button
                className="quiet-button"
                onClick={() => downloadJson(state, 'japanese-current-tab.json')}
              >
                <Download size={15} />
                Скачать эту версию
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
