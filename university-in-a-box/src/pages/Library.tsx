import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  ExternalLink,
  FileText,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router';
import { sources } from '../domain/curriculum';
import type { Source } from '../domain/types';
import { useLearning } from '../learning-context';
import { EmptyState, SectionTitle } from '../components/ui';

type Filter = 'all' | 'saved' | Source['category'];
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все материалы' },
  { id: 'original', label: 'Наши материалы' },
  { id: 'textbook', label: 'Учебник' },
  { id: 'dictionary', label: 'Словари' },
  { id: 'saved', label: 'Сохранённое' },
];
const categoryLabels = {
  original: 'МАТЕРИАЛЫ ПРОГРАММЫ',
  textbook: 'СПРАВОЧНЫЙ ИСТОЧНИК',
  dictionary: 'ЛИЦЕНЗИОННАЯ СПРАВКА',
};

export function Library() {
  const { state, setState, notify } = useLearning();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const matching = sources.filter(
    (source) =>
      (filter === 'all' ||
        source.category === filter ||
        (filter === 'saved' && state.savedSourceIds.includes(source.id))) &&
      `${source.title} ${source.author} ${source.description}`
        .toLocaleLowerCase('ru')
        .includes(normalizedQuery),
  );

  function toggleSource(id: string) {
    const saved = state.savedSourceIds.includes(id);
    setState((previous) => ({
      ...previous,
      savedSourceIds: saved
        ? previous.savedSourceIds.filter((item) => item !== id)
        : [...previous.savedSourceIds, id],
    }));
    notify(saved ? 'Источник убран из сохранённых' : 'Источник сохранён в библиотеке');
  }

  return (
    <div>
      <SectionTitle
        eyebrow="LIBRARIAN · ОПОРА ДЛЯ ЗНАНИЙ"
        title="Меньше шума. Больше смысла."
        description="Небольшая полка, на которой у каждого материала есть автор, назначение и лицензия."
      />
      <section className="library-intro">
        <div className="library-illustration" aria-hidden="true">
          <span lang="ja">本</span>
          <BookOpen size={48} strokeWidth={1} />
        </div>
        <div>
          <span className="eyebrow">ОТКРЫТЬ. ИЗУЧИТЬ. ПРОВЕРИТЬ.</span>
          <h2>Знание не должно быть чёрным ящиком.</h2>
          <p>
            В занятиях нет случайно сгенерированных ответов. Материалы и ключи зафиксированы в
            программе. Здесь можно увидеть, на что они опираются.
          </p>
        </div>
      </section>
      <div className="library-toolbar">
        <div className="filter-chips" aria-label="Тип источника">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? 'active' : ''}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="compact-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти материал"
            aria-label="Поиск в библиотеке"
          />
        </label>
      </div>
      <div className="content-with-aside">
        <div className="source-list">
          {matching.map((source) => (
            <article className="source-card card" key={source.id} id={source.id}>
              <div className={`source-cover ${source.category}`} aria-hidden="true">
                <span lang="ja">
                  {source.category === 'original'
                    ? '学'
                    : source.category === 'textbook'
                      ? '文'
                      : '字'}
                </span>
                <small>
                  {source.category === 'original'
                    ? 'NIHONGO'
                    : source.category === 'textbook'
                      ? 'REFERENCE'
                      : 'DICTIONARY'}
                </small>
              </div>
              <div className="source-copy">
                <div className="line-between">
                  <span className="eyebrow">{categoryLabels[source.category]}</span>
                  <button
                    className={`icon-button ${state.savedSourceIds.includes(source.id) ? 'is-saved' : ''}`}
                    aria-label={`${state.savedSourceIds.includes(source.id) ? 'Убрать источник' : 'Сохранить источник'}: ${source.title}`}
                    aria-pressed={state.savedSourceIds.includes(source.id)}
                    onClick={() => toggleSource(source.id)}
                  >
                    <Bookmark
                      size={18}
                      fill={state.savedSourceIds.includes(source.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
                <h2>{source.title}</h2>
                <p className="source-author">{source.author}</p>
                <p>{source.description}</p>
                <div className="source-usage">
                  <FileText size={15} />
                  <span>{source.usage}</span>
                </div>
                <div className="source-links">
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="license-tag"
                  >
                    {source.license}
                    <ArrowUpRight size={13} />
                    <span className="sr-only"> — лицензия в новой вкладке</span>
                  </a>
                  {source.category === 'original' ? (
                    <Link className="text-link" to="/plan">
                      К материалам
                      <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <a
                      className="text-link"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Открыть источник
                      <ExternalLink size={14} />
                      <span className="sr-only"> в новой вкладке</span>
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!matching.length && (
            <EmptyState
              mark={<BookOpen size={32} />}
              title="На этой полке пока пусто"
              description="Попробуйте другой запрос или сохраните источник закладкой."
              action={
                <button
                  className="button secondary"
                  onClick={() => {
                    setFilter('all');
                    setQuery('');
                  }}
                >
                  Показать все материалы
                </button>
              }
            />
          )}
        </div>
        <aside className="library-aside">
          <section className="card aside-card">
            <ShieldCheck size={24} className="green-text" />
            <h3>Открыто — значит честно.</h3>
            <p>
              Наши учебные материалы доступны по CC BY 4.0: их можно использовать и перерабатывать,
              в том числе коммерчески, с указанием авторства и изменений.
            </p>
            <p>
              У внешних источников свои условия. Для производных материалов CC BY-SA нужно сохранить
              ту же лицензию.
            </p>
            <a
              className="text-link"
              href="https://creativecommons.org/licenses/by/4.0/deed.ru"
              target="_blank"
              rel="noopener noreferrer"
            >
              Что разрешает CC BY
              <ArrowUpRight size={15} />
              <span className="sr-only"> — в новой вкладке</span>
            </a>
          </section>
          <section className="editorial-status">
            <span className="eyebrow">ПРОГРАММА · РЕДАКЦИОННЫЙ СТАТУС</span>
            <h3>Качество требует проверки.</h3>
            <p>
              Программа чтения и письма. Независимая предметная рецензия преподавателем японского
              ещё не проведена.
            </p>
            <p>
              Тексты подготовлены с помощью ИИ и зафиксированы для проверки. Само наличие открытой
              лицензии не доказывает академическое качество.
            </p>
            <p>
              Словарные данные не загружены. Внешние главы указаны для справочной сверки, а не как
              импортированные уроки.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
