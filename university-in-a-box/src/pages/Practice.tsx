import { useState } from 'react';
import { ArrowRight, Bookmark, Check, Eye, Layers, RotateCcw, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { flashcards, lessons } from '../domain/curriculum';
import { scheduleReview } from '../domain/progress';
import type { Flashcard } from '../domain/types';
import { useLearning } from '../learning-context';
import { EmptyState, SectionTitle, plural } from '../components/ui';

type Filter = 'all' | Flashcard['kind'] | 'saved';
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все карточки' },
  { id: 'hiragana', label: 'Хирагана' },
  { id: 'katakana', label: 'Катакана' },
  { id: 'word', label: 'Слова' },
  { id: 'saved', label: 'Сохранённое' },
];

export function Practice() {
  const { state, setState, notify } = useLearning();
  const [filter, setFilter] = useState<Filter>('all');
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [includeFuture, setIncludeFuture] = useState(false);
  const matching = flashcards.filter(
    (card) =>
      (includeFuture ||
        !card.lessonId ||
        card.lessonId === lessons[0].id ||
        state.attempts.some((attempt) => attempt.lessonId === card.lessonId) ||
        state.cardReviews[card.id] ||
        state.savedCardIds.includes(card.id)) &&
      (filter === 'all' ||
        (filter === 'saved' && state.savedCardIds.includes(card.id)) ||
        card.kind === filter),
  );
  const queue = matching.filter(
    (card) =>
      !seen.includes(card.id) &&
      (!state.cardReviews[card.id] ||
        new Date(state.cardReviews[card.id].dueAt).getTime() <= Date.now()),
  );
  const card = queue[0];
  const kindLabels = { hiragana: 'ХИРАГАНА', katakana: 'КАТАКАНА', word: 'СЛОВО В КОНТЕКСТЕ' };

  function review(rating: 'again' | 'good' | 'easy') {
    if (!card || !revealed) return;
    setState((previous) => ({
      ...previous,
      cardReviews: {
        ...previous.cardReviews,
        [card.id]: scheduleReview(previous.cardReviews[card.id], rating),
      },
    }));
    setSeen((previous) => [...previous, card.id]);
    setRevealed(false);
  }

  return (
    <div>
      <SectionTitle
        eyebrow="TUTOR · ПРАКТИКА И ПОВТОРЕНИЕ"
        title="Вспомнить — значит укрепить."
        description="Небольшая пауза, знакомый знак и ещё одна прочная связь в памяти."
      />
      <div className="practice-filter-row">
        <div className="filter-chips" aria-label="Набор карточек">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? 'active' : ''}
              aria-pressed={filter === item.id}
              onClick={() => {
                setFilter(item.id);
                setSeen([]);
                setRevealed(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="muted small">
          <Layers size={15} />
          {plural(matching.length, ['карточка', 'карточки', 'карточек'])}
        </span>
      </div>
      <label className="practice-future">
        <input
          type="checkbox"
          checked={includeFuture}
          onChange={(event) => {
            setIncludeFuture(event.target.checked);
            setSeen([]);
            setRevealed(false);
          }}
        />
        Весь набор, включая будущие уроки. По умолчанию — знаки из начатых занятий.
      </label>
      <div className="practice-workspace">
        <section className="flashcard-area">
          <div className="line-between small muted">
            <span>
              {seen.length
                ? `В этой сессии повторено: ${seen.length}`
                : 'Спокойно посмотрите на знак'}
            </span>
            <span>Осталось на сейчас: {queue.length}</span>
          </div>
          {card ? (
            <>
              <article className={`flashcard ${revealed ? 'revealed' : ''}`}>
                <div className="flashcard-top">
                  <span className="eyebrow">{kindLabels[card.kind]}</span>
                  <button
                    className={`icon-button ${state.savedCardIds.includes(card.id) ? 'is-saved' : ''}`}
                    aria-label={
                      state.savedCardIds.includes(card.id)
                        ? 'Убрать карточку из сохранённых'
                        : 'Сохранить карточку'
                    }
                    aria-pressed={state.savedCardIds.includes(card.id)}
                    onClick={() => {
                      const saved = state.savedCardIds.includes(card.id);
                      setState((previous) => ({
                        ...previous,
                        savedCardIds: saved
                          ? previous.savedCardIds.filter((id) => id !== card.id)
                          : [...previous.savedCardIds, card.id],
                      }));
                      notify(saved ? 'Карточка убрана из сохранённых' : 'Карточка сохранена');
                    }}
                  >
                    <Bookmark
                      size={19}
                      fill={state.savedCardIds.includes(card.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <div className="flashcard-front" lang="ja">
                  {card.front}
                </div>
                {revealed ? (
                  <div className="flashcard-answer" role="status">
                    {card.reading && <span>{card.reading}</span>}
                    <strong>{card.back}</strong>
                  </div>
                ) : (
                  <p className="muted">
                    {card.kind === 'word'
                      ? 'Вспомните значение слова.'
                      : 'Вспомните его латинскую запись.'}
                  </p>
                )}
                <span className="flashcard-bottom-note">見る · 気づく · 覚える</span>
              </article>
              {!revealed ? (
                <button className="button primary reveal-button" onClick={() => setRevealed(true)}>
                  <Eye size={18} />
                  Показать ответ
                </button>
              ) : (
                <div className="review-ratings">
                  <button onClick={() => review('again')}>
                    <RotateCcw size={18} />
                    <strong>Ещё раз</strong>
                    <span>Вернёмся позже</span>
                  </button>
                  <button onClick={() => review('good')}>
                    <Check size={18} />
                    <strong>Вспомнил</strong>
                    <span>Увеличим интервал</span>
                  </button>
                  <button onClick={() => review('easy')}>
                    <Sparkles size={18} />
                    <strong>Легко</strong>
                    <span>Дадим памяти время</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card practice-empty">
              <EmptyState
                mark={matching.length ? <Check size={35} /> : <Bookmark size={32} />}
                title={matching.length ? 'На сейчас достаточно.' : 'Здесь будут ваши слова.'}
                description={
                  matching.length
                    ? 'Новые карточки и повторения появятся здесь, когда придёт время. Можно продолжить занятие.'
                    : 'Сохраняйте карточки закладкой — они появятся в этом наборе.'
                }
                action={
                  <Link className="button primary" to={matching.length ? '/plan' : '/'}>
                    {matching.length ? 'К учебному плану' : 'На главную'}
                    <ArrowRight size={16} />
                  </Link>
                }
              />
            </div>
          )}
          <p className="practice-disclaimer">
            Самооценка определяет время следующего повторения. Она не засчитывает занятия и не
            подтверждает владение языком.
          </p>
        </section>
        <aside className="practice-aside">
          <section className="card aside-card">
            <span className="eyebrow">КАК РАБОТАЕТ ПОВТОРЕНИЕ</span>
            <h3>Не листайте. Вспоминайте.</h3>
            <ol className="numbered-tips">
              <li>
                <span>1</span>
                <div>
                  <strong>Дайте себе секунду</strong>
                  <p>Попробуйте найти ответ, прежде чем открыть его.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Сравните без спешки</strong>
                  <p>Заметьте, какая часть знака помогает его узнать.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Отметьте честно</strong>
                  <p>Забыть — нормально. Мы просто вернём карточку раньше.</p>
                </div>
              </li>
            </ol>
          </section>
          <section className="card aside-card">
            <div className="eyebrow">ВАША КОЛЛЕКЦИЯ</div>
            <div className="collection-count">
              {state.savedCardIds.length}
              <Bookmark size={22} />
            </div>
            <p>Карточек сохранено. Это личная подборка, а не оценка знаний.</p>
            <button
              className="text-link"
              onClick={() => {
                setFilter('saved');
                setSeen([]);
                setRevealed(false);
              }}
            >
              Открыть сохранённое
              <ArrowRight size={16} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
