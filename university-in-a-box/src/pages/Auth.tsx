import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { apiRequest, errorMessage, safeReturnTo } from '../product-api';
import { announceAccountChange, useProduct } from '../product-context';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

const copy = {
  'sign-in': {
    title: 'Рады видеть вас снова.',
    description: 'Ваш план, работы и прогресс — там, где вы остановились.',
    button: 'Войти в кампус',
  },
  'sign-up': {
    title: 'Ваш японский начинается здесь.',
    description: '7 дней с серверным сохранением. Без карты и автоматического списания.',
    button: 'Создать аккаунт',
  },
  'forgot-password': {
    title: 'Вернёмся к обучению.',
    description: 'Пришлём ссылку для создания нового пароля.',
    button: 'Отправить ссылку',
  },
  'reset-password': {
    title: 'Новый пароль. Тот же путь.',
    description: 'После смены пароля войдите заново. Другие сессии будут завершены.',
    button: 'Сохранить новый пароль',
  },
};

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { reload, config } = useProduct();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reset = mode === 'reset-password';
  const signup = mode === 'sign-up';
  const forgot = mode === 'forgot-password';
  const returnTo = safeReturnTo(params.get('returnTo'));
  const token = params.get('token');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if ((signup || reset) && password !== confirmation) {
      setError('Пароли не совпадают. Проверьте оба поля.');
      return;
    }
    setBusy(true);
    try {
      if (forgot) {
        await apiRequest('/api/auth/request-password-reset', {
          method: 'POST',
          body: { email, redirectTo: `${window.location.origin}/auth/reset-password` },
        });
        setMessage(
          'Если аккаунт с этим адресом существует, ссылка для восстановления отправлена. Проверьте также папку «Спам».',
        );
      } else if (reset) {
        await apiRequest('/api/auth/reset-password', {
          method: 'POST',
          body: { newPassword: password, token },
        });
        setPassword('');
        setConfirmation('');
        announceAccountChange();
        await reload();
        navigate('/auth/sign-in?reset=done', { replace: true });
      } else {
        await apiRequest(`/api/auth/${signup ? 'sign-up' : 'sign-in'}/email`, {
          method: 'POST',
          body: {
            email,
            password,
            ...(signup ? { name: name.trim(), termsAccepted: accepted } : {}),
            callbackURL: `${window.location.origin}/auth/sign-in?verified=done`,
          },
        });
        setPassword('');
        setConfirmation('');
        announceAccountChange();
        const account = await reload();
        if (account)
          navigate(account.onboardingComplete ? returnTo : '/onboarding', { replace: true });
        else
          setMessage(
            'Остался один шаг: подтвердите адрес по ссылке в письме, затем войдите в кампус.',
          );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/api/auth/send-verification-email', {
        method: 'POST',
        body: { email, callbackURL: `${window.location.origin}/auth/sign-in?verified=done` },
      });
      setMessage('Если адрес ожидает подтверждения, письмо отправлено повторно.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Link to="/welcome" className="brand">
          <span className="brand-mark" lang="ja">
            学
          </span>
          <span>
            University<span>in a Box</span>
          </span>
        </Link>
        <div>
          <span className="eyebrow">ВАШ ЯПОНСКИЙ · ВАШ ТЕМП</span>
          <span className="auth-glyph" lang="ja">
            一歩
            <br />
            ずつ。
          </span>
          <h2>
            Не быстрее.
            <br />
            Глубже.
          </h2>
          <p>
            От первого знака к собственному тексту. С понятным планом и результатами, которые
            остаются с вами.
          </p>
        </div>
        <span className="auth-footnote">Чтение. Письмо. Понимание.</span>
      </aside>
      <main className="auth-main">
        <Link to="/welcome" className="text-link">
          <ArrowLeft size={16} />О курсе
        </Link>
        <section className="auth-form-wrap">
          <span className="eyebrow">日本語 · ЛИЧНЫЙ КАМПУС</span>
          <h1>{copy[mode].title}</h1>
          <p className="auth-description">{copy[mode].description}</p>
          {params.get('reset') === 'done' && (
            <p className="form-success" role="status">
              <CheckCircle2 size={18} />
              Пароль изменён. Войдите с новым паролем.
            </p>
          )}
          {params.get('verified') === 'done' && (
            <p className="form-success" role="status">
              Адрес подтверждён. Теперь можно войти.
            </p>
          )}
          {message ? (
            <div className="auth-confirmation" role="status">
              <Mail size={32} />
              <h2>Проверьте почту</h2>
              <p>{message}</p>
              <Link className="button secondary" to="/auth/sign-in">
                Ко входу
              </Link>
            </div>
          ) : (
            <form className="product-form" onSubmit={submit}>
              {signup && (
                <label>
                  Как к вам обращаться
                  <input
                    name="name"
                    autoComplete="given-name"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ваше имя"
                  />
                </label>
              )}
              {!reset && (
                <label>
                  Электронная почта
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {!forgot && (
                <label>
                  {reset ? 'Новый пароль' : 'Пароль'}
                  <span className="password-field">
                    <input
                      type={visible ? 'text' : 'password'}
                      name="password"
                      autoComplete={signup || reset ? 'new-password' : 'current-password'}
                      minLength={signup || reset ? 12 : 1}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                  {(signup || reset) && (
                    <small>От 12 символов. Можно использовать длинную парольную фразу.</small>
                  )}
                </label>
              )}
              {(signup || reset) && (
                <label>
                  Повторите пароль
                  <input
                    type={visible ? 'text' : 'password'}
                    name="confirmation"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              )}
              {signup && (
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                    required
                  />
                  <span>
                    Принимаю{' '}
                    <Link to="/legal/terms" target="_blank" rel="noreferrer">
                      условия использования
                    </Link>{' '}
                    и ознакомился с{' '}
                    <Link to="/legal/privacy" target="_blank" rel="noreferrer">
                      политикой конфиденциальности
                    </Link>
                    .
                  </span>
                </label>
              )}
              {reset && !token && (
                <p className="form-error" role="alert">
                  В ссылке нет токена восстановления.{' '}
                  <Link to="/auth/forgot-password">Запросить новую ссылку</Link>
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={busy || (reset && !token)} type="submit">
                {busy ? 'Подождите…' : copy[mode].button}
                <ArrowRight size={17} />
              </button>
              {mode === 'sign-in' && (
                <div className="line-between">
                  <Link className="text-link" to="/auth/forgot-password">
                    Забыли пароль?
                  </Link>
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy || !email}
                    onClick={() => void resendVerification()}
                  >
                    Повторить письмо
                  </button>
                </div>
              )}
            </form>
          )}
          {(signup || mode === 'sign-in') && (
            <p className="auth-switch">
              {signup ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}{' '}
              <Link to={signup ? '/auth/sign-in' : '/auth/sign-up'}>
                {signup ? 'Войти' : 'Начать бесплатно'}
              </Link>
            </p>
          )}
          {config?.environment === 'development' && (
            <p className="environment-note">
              Среда разработки. Аккаунты и база настоящие; письма сохраняются в закрытом локальном
              почтовом журнале. Оплата без настройки провайдера недоступна.
            </p>
          )}
          <p className="auth-security">
            <LockKeyhole size={14} />
            Пароль хранится только в виде защищённого хеша.
          </p>
        </section>
        <p className="small muted">
          Без рекламных трекеров. <Link to="/legal/privacy">Как мы храним данные</Link>
        </p>
      </main>
    </div>
  );
}
