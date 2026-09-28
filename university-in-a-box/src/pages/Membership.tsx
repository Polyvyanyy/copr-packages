import { useState } from 'react';
import { ArrowRight, Check, CreditCard, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { lessons, flashcards } from '../domain/curriculum';
import { apiRequest, errorMessage, openBillingUrl } from '../product-api';
import { useProduct } from '../product-context';
import { SectionTitle, shortDate } from '../components/ui';

export function Membership() {
  const { account, config, reload } = useProduct();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscription = account?.subscription;
  const active = subscription?.status === 'active';

  async function openBilling(portal: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ url: string }>(
        portal ? '/api/billing/portal' : '/api/checkout',
        { method: 'POST', body: {}, accountId: account?.user.id },
      );
      openBillingUrl(result.url);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div className="membership-page">
      <SectionTitle
        eyebrow="ОДИН ЯЗЫК. ОДИН ПОНЯТНЫЙ ПЛАН."
        title="Место для вашего японского."
        description="Начните без карты. Подключайте подписку, когда решите продолжать с синхронизацией между устройствами."
      />
      {params.get('checkout') === 'success' && (
        <div className="soft-note">
          <ShieldCheck size={22} />
          <div>
            <strong>{active ? 'Подписка подтверждена' : 'Проверяем подтверждение оплаты'}</strong>
            <p>
              Доступ меняется только после подтверждения платёжного провайдера, а не по этой ссылке.
            </p>
            <button className="text-link" onClick={() => void reload()}>
              Проверить статус
            </button>
          </div>
        </div>
      )}
      {params.get('checkout') === 'cancel' && (
        <p className="soft-note">
          Оформление отменено. Доступ и ваши учебные данные не изменились.
        </p>
      )}
      <div className="membership-grid">
        <section className="membership-intro">
          <span className="eyebrow">ЧТЕНИЕ И ПИСЬМО · 日本語</span>
          <h2>
            Меньше случайных вкладок.
            <br />
            Больше ясности.
          </h2>
          <p>
            Последовательная программа, письменная практика, повторение и личный архив — в одном
            спокойном пространстве.
          </p>
          <ul className="feature-checks">
            {[
              `${lessons.length} занятий с объяснениями и фиксированными проверками`,
              `${flashcards.length} карточек с индивидуальным расписанием повторений`,
              'Цель, учебный ритм и рекомендации по вашим результатам',
              'Версии письменных работ, заметки и открытые источники',
              'Серверное сохранение и доступ с разных устройств',
              'Экспорт своих данных и управление подпиской без переписки',
            ].map((item) => (
              <li key={item}>
                <Check size={17} />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="membership-price card">
          <span className="pill green">ЯПОНСКИЙ · ЛИЧНЫЙ КАМПУС</span>
          <div className="membership-amount">
            $20<span>/ месяц</span>
          </div>
          <p>Подписка на сервис. Налоги, если применимы, будут отдельно показаны до оплаты.</p>
          <div className="price-divider" />
          {account ? (
            <>
              <strong>
                {active
                  ? 'Подписка активна'
                  : subscription?.access === 'full'
                    ? 'Ваш пробный период идёт'
                    : 'Пробный период завершён'}
              </strong>
              {subscription?.trialEndsAt && !active && (
                <p>
                  Пробный доступ: до {shortDate(subscription.trialEndsAt)}. Без автоматического
                  списания.
                </p>
              )}
              {subscription?.currentPeriodEnd && active && (
                <p>
                  {subscription.cancelAtPeriodEnd ? 'Доступ оплачен до' : 'Следующий период после'}{' '}
                  {shortDate(subscription.currentPeriodEnd)}.
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || !config?.billing.enabled}
                onClick={() => void openBilling(active || subscription?.status === 'past_due')}
              >
                <CreditCard size={17} />
                {busy
                  ? 'Открываем…'
                  : active
                    ? 'Управлять подпиской'
                    : subscription?.status === 'past_due'
                      ? 'Обновить способ оплаты'
                      : 'Подключить за $20 / месяц'}
              </button>
              {!config?.billing.enabled && (
                <p className="environment-note">
                  Приём платежей в этой среде ещё не подключён. Кнопка не имитирует оплату.
                </p>
              )}
              {config?.billing.mode === 'test' && (
                <p className="environment-note">
                  Тестовый режим платёжного провайдера. Реальные деньги не списываются.
                </p>
              )}
            </>
          ) : (
            <>
              <Link className="button primary" to="/auth/sign-up">
                Попробовать 7 дней
                <ArrowRight size={17} />
              </Link>
              <span className="small muted">Без банковской карты. Ничего не спишется само.</span>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Link className="text-link" to="/legal/terms">
            Условия подписки и отмены
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <section className="membership-facts">
        <article>
          <h3>Управление у вас</h3>
          <p>
            Смена карты, счета и отмена продления доступны в защищённом платёжном кабинете. Мы не
            получаем данные вашей карты.
          </p>
        </article>
        <article>
          <h3>Материалы открыты</h3>
          <p>
            Вы платите за размещённый сервис и синхронизацию, а не за исключительные права на
            учебные тексты. Лицензии доступны в библиотеке.
          </p>
        </article>
        <article>
          <h3>Результаты остаются вашими</h3>
          <p>
            После пробного или оплаченного периода можно читать и экспортировать сохранённые данные.
            Новые изменения в аккаунте требуют действующего доступа.
          </p>
        </article>
      </section>
      <div className="soft-note">
        <ShieldCheck size={21} />
        <p>
          Это программа письменного японского, а не аттестация уровня. Нет обещания диплома,
          подготовки ко всем разделам JLPT или независимой академической рецензии, которой ещё не
          было.
        </p>
      </div>
    </div>
  );
}
