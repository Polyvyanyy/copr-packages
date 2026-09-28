import { useState } from 'react';
import { ArrowRight, Cloud, Download, LogOut, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Dialog, SectionTitle, shortDate } from '../components/ui';
import { parseLearningState, STORAGE_KEY } from '../domain/progress';
import { useLearning } from '../learning-context';
import { apiRequest, downloadJson, errorMessage } from '../product-api';
import { announceAccountChange, useProduct } from '../product-context';

export function Account() {
  const { account, status, reload } = useProduct();
  const { setState, state, flush, notify, syncStatus, updatedAt } = useLearning();
  const navigate = useNavigate();
  const [name, setName] = useState(account?.user.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [guest] = useState(() => {
    try {
      return parseLearningState(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  });
  const hasGuestData =
    guest &&
    (guest.attempts.length > 0 ||
      guest.writingDraft ||
      guest.writingHistory.length > 0 ||
      Object.keys(guest.cardReviews).length > 0 ||
      guest.savedSourceIds.length > 0 ||
      guest.savedCardIds.length > 0 ||
      Object.keys(guest.reflections).length > 0);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut(force = false) {
    if (!force && !(await flush())) {
      setLeaveOpen(true);
      return;
    }
    await apiRequest('/api/auth/sign-out', {
      method: 'POST',
      body: {},
      accountId: account?.user.id,
    });
    announceAccountChange();
    await reload();
    navigate('/welcome', { replace: true });
  }

  if (!account)
    return (
      <section className="card account-gate">
        <Cloud size={35} />
        <h1>Ваш прогресс — с вами.</h1>
        <p>
          {status === 'loading'
            ? 'Проверяем сессию…'
            : 'Войдите, чтобы продолжать обучение с разных устройств. Гостевые данные не переносятся в аккаунт без вашего согласия.'}
        </p>
        <div className="form-actions">
          <Link className="button primary" to="/auth/sign-in">
            Войти
            <ArrowRight size={17} />
          </Link>
          <Link className="button secondary" to="/auth/sign-up">
            Создать аккаунт
          </Link>
        </div>
      </section>
    );
  const fullAccess = account.subscription.access === 'full';

  return (
    <div className="account-page">
      <SectionTitle
        eyebrow="ЛИЧНЫЙ КАМПУС"
        title="Ваш аккаунт."
        description="Профиль, безопасность и данные. Всё важное — под вашим контролем."
        action={
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void perform(() => signOut())}
          >
            <LogOut size={16} />
            Выйти
          </button>
        }
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-layout">
        <div className="account-sections">
          <section className="card settings-card">
            <h2>О вас</h2>
            <p className="settings-description">
              Адрес используется для входа и восстановления доступа, не для рекламы.
            </p>
            <div className="account-email">
              <span className="profile-avatar">{account.user.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{account.user.email}</strong>
                <span className="small muted">
                  {account.user.emailVerified ? 'Почта подтверждена' : 'Почта пока не подтверждена'}
                </span>
              </div>
            </div>
            <form
              className="product-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  await apiRequest('/api/auth/update-user', {
                    method: 'POST',
                    accountId: account.user.id,
                    body: { name: name.trim() },
                  });
                  await reload();
                  notify('Имя сохранено');
                });
              }}
            >
              <label>
                Имя
                <input
                  name="name"
                  autoComplete="given-name"
                  required
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button className="button secondary" type="submit" disabled={busy || !name.trim()}>
                Сохранить имя
              </button>
            </form>
          </section>
          <section className="card settings-card">
            <h2>Безопасность</h2>
            <p className="settings-description">
              Новый пароль завершит другие сессии. Текущая сессия останется активной.
            </p>
            <form
              className="product-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  await apiRequest('/api/auth/change-password', {
                    method: 'POST',
                    accountId: account.user.id,
                    body: { currentPassword, newPassword, revokeOtherSessions: true },
                  });
                  setCurrentPassword('');
                  setNewPassword('');
                  announceAccountChange();
                  notify('Пароль изменён. Другие сессии завершены.');
                });
              }}
            >
              <label>
                Текущий пароль
                <input
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  maxLength={128}
                />
              </label>
              <label>
                Новый пароль
                <input
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
                <small>Минимум 12 символов.</small>
              </label>
              <div className="form-actions">
                <button className="button secondary" disabled={busy}>
                  Изменить пароль
                </button>
                <button
                  className="quiet-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await apiRequest('/api/auth/revoke-other-sessions', {
                        method: 'POST',
                        accountId: account.user.id,
                        body: {},
                      });
                      announceAccountChange();
                      notify('Другие сессии завершены');
                    })
                  }
                >
                  Выйти на других устройствах
                </button>
              </div>
            </form>
          </section>
          <section className="card settings-card">
            <h2>Ваши данные</h2>
            <p className="settings-description">
              Экспорт доступен и без активной подписки. Он содержит профиль, учебные записи и
              обращения — не пароли или данные карты.
            </p>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const data = await apiRequest('/api/account/export', {
                      accountId: account.user.id,
                    });
                    downloadJson(data, 'japanese-account-export.json');
                    notify('Экспорт аккаунта подготовлен');
                  })
                }
              >
                <Download size={17} />
                Экспортировать аккаунт
              </button>
              <Link className="text-link" to="/progress">
                Экспорт и импорт учебных записей
                <ArrowRight size={16} />
              </Link>
            </div>
            {hasGuestData && (
              <div className="local-transfer">
                <Upload size={22} />
                <div>
                  <strong>В этом браузере есть гостевые записи</strong>
                  <p>
                    {guest.attempts.length} попыток · {guest.writingHistory.length} версий текста.
                    Они не были автоматически отправлены на сервер.
                  </p>
                  <button
                    className="text-link"
                    disabled={!fullAccess || busy}
                    onClick={() => setImportOpen(true)}
                  >
                    Перенести в аккаунт
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="card settings-card danger-zone">
            <h2>Удаление аккаунта</h2>
            <p>
              Удалятся профиль, сессии, прогресс, тексты и обращения в поддержку. Это действие
              нельзя отменить. Сначала завершите платную подписку и сохраните экспорт.
            </p>
            <button
              className="quiet-button danger-text"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
              Удалить аккаунт
            </button>
          </section>
        </div>
        <aside className="account-aside">
          <section className="card aside-card">
            <Cloud size={25} className="green-text" />
            <h3>Серверное сохранение</h3>
            <p>
              {syncStatus === 'synced'
                ? 'Все изменения сохранены.'
                : syncStatus === 'saving'
                  ? 'Сохраняем последние изменения…'
                  : 'Обратите внимание на статус синхронизации.'}
            </p>
            {updatedAt && <span className="small muted">Обновлено {shortDate(updatedAt)}</span>}
            <div className="price-divider" />
            <strong>
              {account.subscription.status === 'active'
                ? 'Подписка активна'
                : fullAccess
                  ? 'Пробный период'
                  : 'Доступ для чтения'}
            </strong>
            {account.subscription.trialEndsAt && account.subscription.status !== 'active' && (
              <p>Пробный период до {shortDate(account.subscription.trialEndsAt)}.</p>
            )}
            <Link className="button secondary" to="/membership">
              Моя подписка
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="card aside-card">
            <ShieldCheck size={23} />
            <h3>Нужна помощь?</h3>
            <p>Сообщите о проблеме с доступом, оплатой или учебным материалом.</p>
            <Link className="text-link" to="/help">
              Поддержка
              <ArrowRight size={16} />
            </Link>
          </section>
        </aside>
      </div>
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Перенести гостевые записи?"
      >
        <div className="product-form">
          <p>
            Это заменит учебные данные в аккаунте гостевыми записями с этого браузера. Сначала можно
            скачать текущую серверную версию.
          </p>
          <button
            className="button secondary"
            onClick={() => downloadJson(state, 'japanese-before-transfer.json')}
          >
            <Download size={16} />
            Сохранить текущую версию
          </button>
          <div className="form-actions">
            <button
              className="button primary"
              onClick={() => {
                if (guest) setState(guest);
                setImportOpen(false);
                notify('Гостевые записи подготовлены к сохранению на сервере');
              }}
            >
              Заменить данными браузера
            </button>
            <button className="quiet-button" onClick={() => setImportOpen(false)}>
              Отмена
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Есть несохранённые изменения"
      >
        <div className="product-form">
          <p>
            Сервер ещё не принял последнюю версию. Скачайте её перед выходом: изменения в памяти
            вкладки будут потеряны.
          </p>
          <button
            className="button secondary"
            onClick={() => downloadJson(state, 'japanese-unsaved-progress.json')}
          >
            <Download size={16} />
            Скачать изменения
          </button>
          <div className="form-actions">
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void perform(() => signOut(true))}
            >
              Выйти без сохранения
            </button>
            <button className="quiet-button" onClick={() => setLeaveOpen(false)}>
              Остаться
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Удалить аккаунт безвозвратно?"
      >
        <form
          className="product-form"
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              await apiRequest('/api/auth/delete-user', {
                method: 'POST',
                accountId: account.user.id,
                body: { password: deletePassword },
              });
              setDeletePassword('');
              announceAccountChange();
              await reload();
              navigate('/welcome', { replace: true });
            });
          }}
        >
          <p>
            Это удаление аккаунта, а не отмена подписки. Если платный доступ ещё действует, сначала
            завершите его через платёжный кабинет.
          </p>
          <label>
            Введите УДАЛИТЬ
            <input
              required
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
          </label>
          <label>
            Пароль аккаунта
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button danger"
              disabled={busy || deleteConfirmation !== 'УДАЛИТЬ'}
              type="submit"
            >
              Удалить аккаунт и данные
            </button>
            <button className="quiet-button" type="button" onClick={() => setDeleteOpen(false)}>
              Отмена
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
