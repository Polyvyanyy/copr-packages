import { useEffect, useState } from 'react';
import { ArrowRight, LifeBuoy, Send } from 'lucide-react';
import { Link } from 'react-router';
import { SectionTitle, shortDate } from '../components/ui';
import { useProduct } from '../product-context';
import { apiRequest, errorMessage } from '../product-api';
import type { SupportTicket } from '../product-types';

export function Help() {
  const { account, config } = useProduct();
  const [category, setCategory] = useState('content');
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController();
    void apiRequest<{ tickets: SupportTicket[] }>('/api/support', {
      signal: controller.signal,
      accountId: account.user.id,
    })
      .then((data) => {
        if (!controller.signal.aborted) setTickets(data.tickets);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [account?.user.id]);

  return (
    <div className="help-page">
      <SectionTitle
        eyebrow="РЯДОМ, КОГДА НУЖНО"
        title="Помощь и поддержка."
        description="Вопрос о курсе, доступе или данных — начнём с него."
      />
      <div className="help-grid">
        <div>
          <section className="card settings-card">
            <h2>Частые вопросы</h2>
            {[
              [
                'Как перенести старый прогресс?',
                'Войдите в аккаунт и откройте раздел «Ваши данные». Перенос гостевых записей выполняется только после подтверждения. Перед заменой можно скачать текущую версию.',
              ],
              [
                'Почему занятие ещё не пройдено?',
                'Нужна полная попытка с результатом от 80% без подсказок. Активность и самооценка карточек не заменяют проверку. Для статуса отсроченного повторения нужны две такие попытки с интервалом не менее семи дней.',
              ],
              [
                'Что будет после пробного периода?',
                'Ничего не спишется автоматически: пробный период не требует карты. Данные аккаунта останутся доступны для чтения и экспорта. Для новых серверных сохранений подключите подписку; локальная практика остаётся доступной.',
              ],
              [
                'Как отменить продление?',
                'Откройте «Подписка» → «Управлять подпиской». В платёжном кабинете можно отменить продление и посмотреть счета. Уже оплаченный доступ действует до конца периода.',
              ],
              [
                'Что делать при конфликте синхронизации?',
                'Не закрывайте вкладку. Скачайте её версию, затем выберите актуальные данные с сервера или явно замените их своими. Мы не перезаписываем работу с другого устройства молча.',
              ],
              [
                'Как сообщить об ошибке в материале?',
                'Выберите категорию «Учебный материал» и укажите название урока, задание и спорный фрагмент. Исправление ключа требует новой редакции задания: старые результаты не должны менять смысл.',
              ],
            ].map(([question, answer]) => (
              <details className="help-question" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </section>
          {account && tickets.length > 0 && (
            <section className="card settings-card">
              <h2>Ваши обращения</h2>
              <ul className="ticket-list">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <div>
                      <strong>№ {ticket.id.slice(0, 8)}</strong>
                      <span className="pill">
                        {ticket.status === 'closed' ? 'Закрыто' : 'Принято'}
                      </span>
                    </div>
                    <p>{ticket.message}</p>
                    <span className="small muted">{shortDate(ticket.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <section className="card settings-card support-card">
          <LifeBuoy size={30} />
          <h2>Напишите нам</h2>
          <p>
            Не присылайте пароли, полные данные карты или другие секреты. Номер обращения сохранится
            в аккаунте.
          </p>
          {account ? (
            <form
              className="product-form"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError(null);
                setSent(null);
                void apiRequest<{ id: string; createdAt: string }>('/api/support', {
                  method: 'POST',
                  accountId: account.user.id,
                  body: { category, message: message.trim() },
                })
                  .then(async (result) => {
                    setMessage('');
                    setSent(`Обращение № ${result.id.slice(0, 8)} принято.`);
                    const data = await apiRequest<{ tickets: SupportTicket[] }>('/api/support', {
                      accountId: account.user.id,
                    });
                    setTickets(data.tickets);
                  })
                  .catch((cause) => setError(errorMessage(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Тема
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="content">Учебный материал</option>
                  <option value="account">Аккаунт и данные</option>
                  <option value="billing">Оплата и подписка</option>
                  <option value="other">Другой вопрос</option>
                </select>
              </label>
              <label>
                Ваш вопрос
                <textarea
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={6}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Что произошло и какого результата вы ожидали?"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {sent && (
                <p className="form-success" role="status">
                  {sent}
                </p>
              )}
              <button className="button primary" disabled={busy || message.trim().length < 10}>
                {busy ? 'Отправляем…' : 'Отправить обращение'}
                <Send size={16} />
              </button>
            </form>
          ) : (
            <>
              <Link className="button primary" to="/auth/sign-in?returnTo=/help">
                Войти и написать
                <ArrowRight size={17} />
              </Link>
              {config?.operator.email && (
                <a className="text-link" href={`mailto:${config.operator.email}`}>
                  Не получается войти? {config.operator.email}
                </a>
              )}
            </>
          )}
          <Link className="text-link" to="/legal/privacy">
            Как обрабатываются обращения
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </div>
  );
}
