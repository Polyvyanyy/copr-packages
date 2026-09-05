import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  Clock,
  Compass,
  Leaf,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link } from 'react-router';
import { flashcards, lessons, modules } from '../domain/curriculum';
import {
  getActivityDates,
  getCourseStats,
  getNextLesson,
  isLessonCompleted,
} from '../domain/progress';
import { useLearning } from '../learning-context';
import { AdviserDialog } from '../components/AdviserDialog';
import { StudyArtwork } from '../components/Artwork';
import { ProgressBar, SectionLink, plural } from '../components/ui';

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function Home() {
  const { state, setState, notify } = useLearning();
  const [adviser, setAdviser] = useState<'goal' | 'diagnostic' | null>(null);
  const stats = getCourseStats(state, lessons);
  const nextLesson =
    !state.attempts.length && state.diagnostic
      ? (lessons.find((lesson) => lesson.id === state.diagnostic?.recommendedLessonId) ??
        getNextLesson(lessons, state))
      : getNextLesson(lessons, state);
  const today = new Date();
  const activity = getActivityDates(state);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
  const activeThisWeek = week.filter((date) => activity.has(localDate(date))).length;
  const dailyCard = flashcards.find((card) => card.kind === 'word') ?? flashcards[0];
  const saved = state.savedCardIds.includes(dailyCard.id);
  const due = flashcards.filter(
    (card) =>
      state.cardReviews[card.id] &&
      new Date(state.cardReviews[card.id].dueAt).getTime() <= Date.now(),
  ).length;
  const firstStep = nextLesson.id === 'hiragana-vowels';

  return (
    <div className="home-page">
      <div className="home-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-sun" />
            ВАШ ЛИЧНЫЙ КАМПУС
          </div>
          <h1>
            Японский, шаг за шагом<span className="terracotta">.</span>
          </h1>
          <p>
            {state.attempts.length
              ? 'Рады видеть вас снова. Продолжим с того места, где остановились.'
              : 'Новый язык начинается с маленького открытия. Сделаем его сегодня.'}
          </p>
        </div>
        <div className="date-label">
          <CalendarDays size={15} />
          {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(today)}
        </div>
      </div>
      <div className="dashboard-layout">
        <div className="dashboard-primary">
          <section className="lesson-hero">
            <div className="hero-copy">
              <div className="hero-meta">
                <span className="pill green">
                  <span className="status-dot" />
                  {state.attempts.length ? 'ПРОДОЛЖИМ ОБУЧЕНИЕ' : 'ВАШ ПЕРВЫЙ ШАГ'}
                </span>
                <span>Урок {String(lessons.indexOf(nextLesson) + 1).padStart(2, '0')}</span>
              </div>
              <h2>
                {firstStep ? (
                  <>
                    Пять знаков.
                    <br />
                    Целый новый мир.
                  </>
                ) : (
                  nextLesson.title
                )}
              </h2>
              <p>
                {firstStep
                  ? 'Начните с あ・い・う・え・お. Научитесь узнавать их и различать в коротких записях.'
                  : nextLesson.description}
              </p>
              <div className="hero-action">
                <Link className="button primary" to={`/lesson/${nextLesson.id}`}>
                  {state.attempts.length ? 'Продолжить занятие' : 'Начать занятие'}
                  <ArrowRight size={17} />
                </Link>
                <span className="hero-duration">
                  <Clock size={14} />
                  {nextLesson.durationMinutes} минут
                </span>
              </div>
              <div className="hero-bottom">
                <span>{String(lessons.indexOf(nextLesson) + 1).padStart(2, '0')}</span>
                <div />
                <span>ОТ ЗНАКА К СМЫСЛУ</span>
              </div>
            </div>
            <StudyArtwork />
          </section>
          {!state.diagnostic && (
            <button className="diagnostic-banner" onClick={() => setAdviser('diagnostic')}>
              <span className="round-icon">
                <Compass size={22} strokeWidth={1.6} />
              </span>
              <span>
                <strong>Уже немного знакомы с японским?</strong>
                <small>Пять вопросов помогут найти подходящую точку старта.</small>
              </span>
              <span className="diagnostic-link">
                Выбрать начало
                <ArrowUpRight size={17} />
              </span>
            </button>
          )}
          <section className="path-section">
            <div className="section-heading">
              <h2>Ваш учебный путь</h2>
              <SectionLink to="/plan">Весь план</SectionLink>
            </div>
            <div className="module-preview-grid">
              {modules.map((module, index) => {
                const completed = module.lessonIds.filter((id) => {
                  const lesson = lessons.find((item) => item.id === id);
                  return lesson && isLessonCompleted(lesson, state.attempts);
                }).length;
                const currentModule = nextLesson.moduleId === module.id;
                return (
                  <Link
                    className={`module-preview ${currentModule ? 'current' : ''}`}
                    key={module.id}
                    to={`/plan#${module.id}`}
                  >
                    <div className="module-top">
                      <span className="module-number">0{index + 1}</span>
                      <span className={`module-label ${currentModule ? 'green-text' : ''}`}>
                        {completed === module.lessonIds.length
                          ? 'Пройдено'
                          : currentModule
                            ? 'Вы здесь'
                            : 'Впереди'}
                      </span>
                    </div>
                    <span className="module-glyph" lang="ja">
                      {['あ', 'ア', '文'][index]}
                    </span>
                    <h3>{module.title}</h3>
                    <p>
                      {index === 0
                        ? 'Основа японского письма'
                        : index === 1
                          ? 'Знакомые слова в новой форме'
                          : 'От слов к собственным мыслям'}
                    </p>
                    <ProgressBar
                      value={(completed / module.lessonIds.length) * 100}
                      label={`Прогресс: ${module.title}`}
                    />
                    <div className="module-bottom">
                      <span>
                        {completed} /{' '}
                        {plural(module.lessonIds.length, ['занятие', 'занятия', 'занятий'])}
                      </span>
                      <ArrowUpRight size={15} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
          <section className="daily-practice">
            <div className="section-heading">
              <h2>Понемногу — каждый день</h2>
              <span className="section-overline">ЗАКРЕПЛЯЕМ ЗНАНИЯ</span>
            </div>
            <div className="practice-tiles">
              <Link to="/practice" className="practice-tile">
                <span className="practice-tile-icon">
                  <RotateCcw size={21} />
                </span>
                <div>
                  <h3>{due ? 'Время вспомнить' : 'Первые карточки'}</h3>
                  <p>
                    {due
                      ? `${plural(due, ['карточка ждёт', 'карточки ждут', 'карточек ждут'])} повторения`
                      : 'Узнавайте знаки и возвращайтесь к ним'}
                  </p>
                </div>
                <ArrowUpRight size={18} />
              </Link>
              <Link to="/writing" className="practice-tile">
                <span className="practice-tile-icon peach">
                  <span lang="ja">文</span>
                </span>
                <div>
                  <h3>С чистого листа</h3>
                  <p>Первое предложение о себе</p>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            </div>
          </section>
          <div className="academic-note">
            <ShieldMark />
            <div>
              <strong>Не просто запоминать. Понимать.</strong>
              <p>
                Ясная программа, открытые источники и практика, которая показывает ваш настоящий
                прогресс.
              </p>
            </div>
            <Link to="/library" aria-label="Узнать о наших источниках">
              <ArrowUpRight size={19} />
            </Link>
          </div>
        </div>
        <aside className="dashboard-aside" aria-label="Учебный ритм и заметки">
          <section className="rhythm-card">
            <div className="section-heading">
              <h2>Ваш ритм</h2>
              <Leaf size={19} />
            </div>
            <p>Небольшое занятие — уже движение.</p>
            <div className="week-calendar">
              {week.map((date, index) => {
                const key = localDate(date);
                const active = activity.has(key);
                return (
                  <div
                    key={key}
                    className={`calendar-day ${key === localDate(today) ? 'today' : ''} ${active ? 'studied' : ''}`}
                    aria-label={`${date.getDate()}: ${active ? 'было занятие' : 'без занятий'}`}
                  >
                    <span>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index]}</span>
                    <span>{active ? <Check size={16} /> : date.getDate()}</span>
                    <i />
                  </div>
                );
              })}
            </div>
            <div className="weekly-goal">
              <div className="goal-ring">
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="27" fill="none" stroke="#e7eade" strokeWidth="4" />
                  <circle
                    cx="32"
                    cy="32"
                    r="27"
                    fill="none"
                    stroke="#7f9670"
                    strokeWidth="4"
                    strokeDasharray={`${Math.min(1, activeThisWeek / state.goal.daysPerWeek) * 169.65} 169.65`}
                    transform="rotate(-90 32 32)"
                    strokeLinecap="round"
                  />
                </svg>
                <span>
                  {activeThisWeek}
                  <small>/{state.goal.daysPerWeek}</small>
                </span>
              </div>
              <div>
                <strong>Дни с практикой</strong>
                <span>ваша цель на эту неделю</span>
              </div>
            </div>
            <div className="rhythm-footer">
              <span>
                <Clock size={14} />
                {state.goal.minutesPerDay} минут в день
              </span>
              <button className="quiet-button" onClick={() => setAdviser('goal')}>
                Изменить
              </button>
            </div>
          </section>
          <section className="word-card">
            <div className="word-heading">
              <span className="eyebrow">СЛОВО ДЛЯ ВАШЕГО ДНЯ</span>
              <button
                className={`icon-button ${saved ? 'is-saved' : ''}`}
                aria-label={saved ? 'Убрать слово из сохранённых' : 'Сохранить слово'}
                aria-pressed={saved}
                onClick={() => {
                  setState((previous) => ({
                    ...previous,
                    savedCardIds: saved
                      ? previous.savedCardIds.filter((id) => id !== dailyCard.id)
                      : [...previous.savedCardIds, dailyCard.id],
                  }));
                  notify(saved ? 'Слово убрано из сохранённых' : 'Слово сохранено в практике');
                }}
              >
                <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="daily-word" lang="ja">
              {dailyCard.front}
            </div>
            {dailyCard.reading && (
              <div className="word-reading" lang="ja">
                {dailyCard.reading}
              </div>
            )}
            <strong className="word-meaning">{dailyCard.back}</strong>
            <div className="word-divider" />
            <p>
              Не учите слова отдельно.
              <br />
              Находите их в знакомых знаках.
            </p>
            <SectionLink to="/practice">Открыть карточки</SectionLink>
          </section>
          <section className="quiet-reminder">
            <span className="reminder-spark">
              <Sparkles size={18} />
            </span>
            <span className="eyebrow">ПОДХОД ALTER</span>
            <h3>
              У понимания <br />
              пять помощников.
            </h3>
            <p>
              План, источники, практика, <br />
              обратная связь и новые связи.
            </p>
            <div className="alter-letters" aria-label="Adviser, Librarian, Tutor, Editor, Roommate">
              {[
                ['A', '/plan'],
                ['L', '/library'],
                ['T', `/lesson/${nextLesson.id}`],
                ['E', '/writing'],
                ['R', '/connections'],
              ].map(([letter, to]) => (
                <Link key={letter} to={to} aria-label={`Помощник ${letter}`}>
                  {letter}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <div className="home-summary">
        <span>
          <Target size={14} />
          {stats.completed} из {stats.total} занятий пройдено
        </span>
        <span>Знание — это путь, а не гонка.</span>
      </div>
      {adviser && (
        <AdviserDialog
          startDiagnostic={adviser === 'diagnostic'}
          onClose={() => setAdviser(null)}
        />
      )}
    </div>
  );
}

function ShieldMark() {
  return (
    <span className="academic-symbol">
      <BookOpenSymbol />
    </span>
  );
}
function BookOpenSymbol() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14" />
      <path d="M6 9h3m-3 4h3m6-4h3m-3 4h3" />
    </svg>
  );
}
