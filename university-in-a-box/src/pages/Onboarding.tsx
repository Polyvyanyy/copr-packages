import { useState } from 'react';
import { ArrowRight, BookOpen, Check, PenLine, Sprout } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useLearning } from '../learning-context';
import { useProduct } from '../product-context';
import { apiRequest, errorMessage } from '../product-api';
import type { LearningState } from '../domain/types';

export function Onboarding() {
  const { account, status, reload } = useProduct();
  const { state, setState, flush } = useLearning();
  const [purpose, setPurpose] = useState(state.goal.purpose);
  const [minutes, setMinutes] = useState(state.goal.minutesPerDay);
  const [days, setDays] = useState(state.goal.daysPerWeek);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  if (!account)
    return (
      <section className="card account-gate">
        <h1>Свой план — в своём аккаунте.</h1>
        <p>
          {status === 'loading'
            ? 'Проверяем сессию…'
            : 'Создайте аккаунт, чтобы сохранять план и учиться с разных устройств.'}
        </p>
        <Link className="button primary" to="/auth/sign-up">
          Создать аккаунт
        </Link>
      </section>
    );

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      setState((previous) => ({
        ...previous,
        goal: { purpose, minutesPerDay: minutes, daysPerWeek: days },
      }));
      if (!(await flush())) throw new Error('not-saved');
      await apiRequest('/api/account/onboarding', {
        method: 'POST',
        body: {},
        accountId: account?.user.id,
      });
      await reload();
      navigate('/', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'not-saved'
          ? 'План ещё не сохранён. Проверьте сообщение о синхронизации и попробуйте снова.'
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  const purposes: {
    id: LearningState['goal']['purpose'];
    title: string;
    description: string;
    icon: typeof BookOpen;
  }[] = [
    {
      id: 'foundation',
      title: 'Начать с основ',
      description: 'Разобраться в знаках и построении фразы.',
      icon: Sprout,
    },
    {
      id: 'reading',
      title: 'Читать с пониманием',
      description: 'От коротких записей к небольшим текстам.',
      icon: BookOpen,
    },
    {
      id: 'writing',
      title: 'Выражать мысли письменно',
      description: 'Собирать собственные предложения.',
      icon: PenLine,
    },
  ];
  return (
    <div className="onboarding-page">
      <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В ВАШ КАМПУС</span>
      <h1>План, который впишется в жизнь.</h1>
      <p>Выберите ориентир и посильный ритм. Всё можно изменить позже.</p>
      <section className="card onboarding-card">
        <fieldset>
          <legend>Что для вас сейчас важнее?</legend>
          <div className="purpose-options">
            {purposes.map(({ id, title, description, icon: Icon }) => (
              <label key={id} className={purpose === id ? 'selected' : ''}>
                <input
                  type="radio"
                  name="purpose"
                  checked={purpose === id}
                  value={id}
                  onChange={() => setPurpose(id)}
                />
                <Icon size={23} />
                <strong>{title}</strong>
                <span>{description}</span>
                {purpose === id && <Check className="purpose-check" size={17} />}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Сколько времени выделить на день?</legend>
          <div className="choice-row">
            {[10, 15, 20, 30].map((value) => (
              <button
                key={value}
                className={minutes === value ? 'selected' : ''}
                aria-pressed={minutes === value}
                onClick={() => setMinutes(value)}
              >
                {value} минут
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Сколько дней в неделю?</legend>
          <div className="choice-row">
            {[3, 4, 5, 7].map((value) => (
              <button
                key={value}
                className={days === value ? 'selected' : ''}
                aria-pressed={days === value}
                onClick={() => setDays(value)}
              >
                {value} {value === 3 || value === 4 ? 'дня' : 'дней'}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="onboarding-summary">
          <strong>{minutes * days} минут в неделю</strong>
          <p>Ритм — ориентир, а не обязательство. За пропуски нет штрафов.</p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy} onClick={() => void finish()}>
          {busy ? 'Сохраняем план…' : 'К моему первому шагу'}
          <ArrowRight size={17} />
        </button>
      </section>
      <p className="small muted">
        Знакомы с японским? На главной можно пройти короткую диагностику и выбрать точку старта.
      </p>
    </div>
  );
}
