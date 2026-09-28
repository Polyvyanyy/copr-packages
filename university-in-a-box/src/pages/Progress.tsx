import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Check,
  ChevronRight,
  Clock,
  Download,
  History,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router';
import { lessons } from '../domain/curriculum';
import {
  getActivityDates,
  getCourseStats,
  getLessonStatus,
  isLessonCompleted,
  parseLearningState,
} from '../domain/progress';
import type { LearningState } from '../domain/types';
import { useLearning } from '../learning-context';
import { Dialog, EmptyState, ProgressBar, SectionTitle, shortDate, plural } from '../components/ui';
import { useProduct } from '../product-context';

const MAX_IMPORT_BYTES = 1_000_000;

const statusLabels = {
  new: 'Ещё впереди',
  practising: 'Есть практика',
  completed: 'Пройдено в практике',
  'review-due': 'Пора повторить',
  retained: 'Повторено с отсрочкой',
};

function isVersionOneObject(value: unknown): value is { version: 1 } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      Object.prototype.hasOwnProperty.call(value, 'version') &&
      (value as { version?: unknown }).version === 1
    );
  } catch {
    return false;
  }
}

function localDateStamp(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function attemptSummary(correct: number, total: number, assisted: boolean): string {
  return `${correct} из ${total} по ключу${assisted ? ' · с подсказками' : ' · без подсказок'}`;
}

function lessonStatusDetail(status: keyof typeof statusLabels, attempts: number): string {
  if (status === 'new') return 'Попыток ещё нет';
  if (status === 'practising')
    return `${plural(attempts, ['попытка', 'попытки', 'попыток'])} · порог без подсказок ещё не достигнут`;
  if (status === 'completed') return 'Порог пройден · отсроченное повторение ещё впереди';
  if (status === 'review-due')
    return 'Последняя самостоятельная попытка была не меньше недели назад';
  return 'Есть две самостоятельные попытки с интервалом не меньше недели';
}

export function Progress() {
  const { state, setState, notify, resetProgress } = useLearning();
  const { account } = useProduct();
  const [importCandidate, setImportCandidate] = useState<LearningState | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = getCourseStats(state, lessons);
  const activityDates = getActivityDates(state);
  const attempts = [...state.attempts].sort(
    (left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt),
  );
  const lessonRows = lessons.map((lesson, index) => {
    const lessonAttempts = attempts.filter((attempt) => attempt.lessonId === lesson.id);
    return {
      lesson,
      index,
      attempts: lessonAttempts,
      completed: isLessonCompleted(lesson, state.attempts),
      status: getLessonStatus(lesson, state.attempts),
    };
  });
  const retained = lessonRows.filter((row) => row.status === 'retained').length;
  const reviewDue = lessonRows.filter((row) => row.status === 'review-due').length;
  const latestAttempts = attempts.slice(0, 10);

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `university-in-a-box-japanese-${localDateStamp(new Date())}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      notify(
        account
          ? 'JSON-файл с учебным прогрессом подготовлен.'
          : 'JSON-файл с локальным прогрессом подготовлен.',
      );
    } catch {
      notify('Не удалось подготовить JSON-файл в этом браузере.');
    }
  }

  async function chooseImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(
        'Файл слишком большой для безопасного локального импорта. Выберите JSON меньше 1 МБ.',
      );
      return;
    }

    try {
      const raw = JSON.parse(await file.text()) as unknown;
      if (!isVersionOneObject(raw)) {
        setImportError(
          'Нужен объект JSON версии 1 из University in a Box. Текущие данные не изменены.',
        );
        return;
      }
      setImportError(null);
      setImportCandidate(parseLearningState(raw));
    } catch {
      setImportError('Не удалось прочитать этот JSON-файл. Текущие данные не изменены.');
    }
  }

  function confirmImport() {
    if (!importCandidate) return;
    setState(importCandidate);
    setImportCandidate(null);
    notify(
      account
        ? 'Данные из JSON подготовлены к сохранению в аккаунте.'
        : 'Локальный прогресс заменён данными из JSON-файла.',
    );
  }

  function confirmReset() {
    if (!account) {
      void resetProgress();
      setResetOpen(false);
      notify('Локальные результаты и настройки сброшены.');
      return;
    }
    setResetBusy(true);
    setResetError(null);
    void resetProgress().then((success) => {
      setResetBusy(false);
      if (success) {
        setResetOpen(false);
        notify('Учебные данные удалены с сервера. Аккаунт и подписка сохранены.');
      } else {
        setResetError('Сброс не выполнен. Закройте окно и проверьте сообщение о синхронизации. Ваши данные не удалены.');
      }
    });
  }

  return (
    <div className="progress-page">
      <SectionTitle
        eyebrow={account ? 'ПРОГРАММА · ДАННЫЕ ВАШЕГО АККАУНТА' : 'ПРОГРАММА · ЛОКАЛЬНЫЕ ДАННЫЕ'}
        title="Мой прогресс"
        description={
          account
            ? 'Ваши действия и результаты, сохранённые в аккаунте, — без обещаний внешней сертификации.'
            : 'Здесь видны действия и результаты учебной практики в этом браузере — без обещаний внешней сертификации.'
        }
      />

      <section className="progress-metrics" aria-label="Метрики учебной практики">
        <article className="metric-card">
          <span className="eyebrow">ПРОЙДЕНО В ПРАКТИКЕ</span>
          <strong>
            {stats.completed}
            <small> / {stats.total}</small>
          </strong>
          <ProgressBar value={stats.percentage} label="Доля занятий, пройденных в практике" />
          <p>{stats.percentage}% занятий имеют попытку с результатом не ниже 80% без подсказок.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">ПОВТОРЕНО С ОТСРОЧКОЙ</span>
          <strong>{retained}</strong>
          <p>Две самостоятельные удачные попытки разделены как минимум неделей.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">ЖДЁТ ПОВТОРЕНИЯ</span>
          <strong>{reviewDue}</strong>
          <p>Уроки, к которым пора вернуться после отсрочки.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">АКТИВНЫЕ ДНИ</span>
          <strong>{activityDates.size}</strong>
          <p>Календарные дни с сохранённой учебной активностью.</p>
        </article>
      </section>

      <div className="content-with-aside">
        <div>
          <section className="card progress-lessons" aria-labelledby="progress-lessons-title">
            <div>
              <span className="eyebrow">ЗНАНИЯ В УЧЕБНОЙ ПРАКТИКЕ</span>
              <h2 id="progress-lessons-title">По занятиям</h2>
              <p className="muted">
                Каждая строка ведёт к занятию и показывает только то, что зафиксировано в его
                попытках.
              </p>
            </div>
            <div>
              {lessonRows.map(({ lesson, index, attempts: lessonAttempts, completed, status }) => {
                const latest = lessonAttempts[0];
                return (
                  <Link className="progress-lesson-row" key={lesson.id} to={`/lesson/${lesson.id}`}>
                    <span className={`lesson-step ${completed ? 'done' : ''}`}>
                      {completed ? <Check size={17} /> : String(index + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <strong>{lesson.title}</strong>
                      <small className="muted">
                        {lesson.japaneseTitle} ·{' '}
                        {lessonAttempts.length
                          ? plural(lessonAttempts.length, ['попытка', 'попытки', 'попыток'])
                          : 'без попыток'}
                      </small>
                    </span>
                    <span>
                      <strong>{statusLabels[status]}</strong>
                      <small className="muted">
                        {latest
                          ? `Последняя: ${attemptSummary(latest.correct, latest.total, latest.assisted)} · ${shortDate(latest.completedAt)}`
                          : lessonStatusDetail(status, lessonAttempts.length)}
                      </small>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="card progress-history" aria-labelledby="progress-history-title">
            <div>
              <span className="eyebrow">ПОСЛЕДНИЕ СОХРАНЁННЫЕ ОТВЕТЫ</span>
              <h2 id="progress-history-title">История попыток</h2>
              <p className="small muted">
                Локальная история хранит до 500 записей: свежие попытки и подтверждения достигнутых
                статусов. Для долгосрочного архива экспортируйте JSON.
              </p>
              <p className="muted">
                Показаны десять последних попыток. Баллы — ответы по ключу, а не оценка владения
                языком.
              </p>
            </div>
            {latestAttempts.length === 0 ? (
              <EmptyState
                mark={<History size={30} />}
                title="История пока пуста"
                description="После первой практики здесь появятся дата, результат по ключу и отметка о подсказках."
                action={
                  <Link className="button primary" to={`/lesson/${lessons[0].id}`}>
                    Начать первое занятие
                  </Link>
                }
              />
            ) : (
              <div>
                {latestAttempts.map((attempt) => {
                  const lesson = lessons.find((item) => item.id === attempt.lessonId);
                  return (
                    <div className="history-row" key={attempt.id}>
                      <span className="lesson-step">
                        <Clock size={16} />
                      </span>
                      <span>
                        {lesson ? (
                          <Link className="text-link" to={`/lesson/${lesson.id}`}>
                            {lesson.title}
                            <ChevronRight size={15} />
                          </Link>
                        ) : (
                          <strong>Занятие из старой версии</strong>
                        )}
                        <small className="muted">
                          {shortDate(attempt.completedAt)} ·{' '}
                          {attempt.assisted ? 'с подсказками' : 'без подсказок'}
                        </small>
                      </span>
                      <strong>
                        {attempt.correct} / {attempt.total}
                      </strong>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="progress-aside">
          <section className="card soft-note">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h2>Как читать эти данные</h2>
              <p>
                <strong>Пройдено в практике</strong> означает хотя бы одну полную попытку с 80% или
                больше правильных ответов без подсказок.
              </p>
              <p>
                <strong>Повторено с отсрочкой</strong> появляется только после ещё одной такой
                попытки через семь или больше дней.
              </p>
              <p>
                <strong>Активный день</strong> показывает сохранённое действие в календаре, но сам
                по себе не доказывает, что материал запомнился.
              </p>
            </div>
          </section>

          <section className="card">
            <span className="eyebrow">КАРТОЧКИ — ОТДЕЛЬНО ОТ УРОКОВ</span>
            <h2>Самооценка повторений</h2>
            <p>
              <strong>{stats.reviewedCards}</strong> карточек оценено ·{' '}
              <strong>{stats.totalReviews}</strong> оценок всего.
            </p>
            <p className="muted">
              Оценка карточки помогает запланировать её повторение, но не меняет статус занятий.
            </p>
            <Link className="text-link" to="/practice">
              Открыть практику
              <ChevronRight size={16} />
            </Link>
          </section>

          <section className="card progress-data" aria-labelledby="progress-data-title">
            <span className="eyebrow">РЕЗЕРВНАЯ КОПИЯ И ПЕРЕНОС</span>
            <h2 id="progress-data-title">
              {account ? 'Данные аккаунта' : 'Данные в этом браузере'}
            </h2>
            <p className="muted">
              {account ? 'Изменения сохраняются в вашем аккаунте. Статус синхронизации виден сверху. Экспортируйте записи перед импортом или сбросом: эти действия заменят серверную версию.' : 'Эти гостевые результаты живут только на этом устройстве и в этом браузере. Для переноса между устройствами можно создать аккаунт или использовать JSON-файл.'} Учебные записи не являются внешним подтверждением результата.
            </p>
            <button className="button secondary" onClick={exportData}>
              <Download size={17} />
              Экспортировать JSON
            </button>
            <button className="button secondary" onClick={() => inputRef.current?.click()}>
              <Upload size={17} />
              Импортировать JSON
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={chooseImport}
              tabIndex={-1}
              style={{ display: 'none' }}
            />
            {importError && (
              <p className="soft-note" role="alert">
                {importError}
              </p>
            )}
            <button className="quiet-button" onClick={() => setResetOpen(true)}>
              <RotateCcw size={16} />
              {account ? 'Сбросить учебные данные' : 'Сбросить локальные данные'}
            </button>
          </section>
        </aside>
      </div>

      <Dialog
        open={importCandidate !== null}
        onClose={() => setImportCandidate(null)}
        title="Заменить текущие данные?"
      >
        {importCandidate && (
          <div className="progress-data">
            <p>
              Импорт заменит все текущие {account ? 'данные аккаунта' : 'локальные результаты'}, карточки, черновик и настройки на
              данные из выбранного файла.
            </p>
            <p className="muted">
              После безопасной проверки в файле найдено: {importCandidate.attempts.length} попыток,{' '}
              {Object.keys(importCandidate.cardReviews).length} карточек с расписанием и{' '}
              {importCandidate.writingHistory.length} версий текста. Неизвестные или повреждённые
              записи не импортируются.
            </p>
            <div>
              <button className="quiet-button" onClick={() => setImportCandidate(null)}>
                Отмена
              </button>
              <button className="button primary" onClick={confirmImport}>
                Заменить данные
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={() => { if (!resetBusy) setResetOpen(false); }}
        title={account ? 'Сбросить прогресс аккаунта?' : 'Сбросить локальный прогресс?'}
      >
        <div className="progress-data">
          <p>
            Будут удалены все сохранённые попытки, карточки, тексты и настройки {account ? 'в вашем аккаунте' : 'в этом браузере'}.
            Отменить это действие нельзя.
          </p>
          <p className="muted">
            Если эти данные могут понадобиться, сначала экспортируйте JSON-файл.
          </p>
          {resetError && <p className="form-error" role="alert">{resetError}</p>}
          <div>
            <button className="quiet-button" disabled={resetBusy} onClick={() => setResetOpen(false)}>
              Отмена
            </button>
            <button className="button danger" disabled={resetBusy} onClick={confirmReset}>
              {resetBusy ? 'Удаляем данные…' : 'Сбросить данные'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
