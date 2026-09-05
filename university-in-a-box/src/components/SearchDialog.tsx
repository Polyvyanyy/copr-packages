import { useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Search } from 'lucide-react';
import { Link } from 'react-router';
import { lessons, sources } from '../domain/curriculum';
import { Dialog } from './ui';

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const search = query.trim().toLocaleLowerCase();
  const results = lessons.filter((lesson) =>
    `${lesson.title} ${lesson.description} ${lesson.japaneseTitle}`
      .toLocaleLowerCase()
      .includes(search),
  );
  const books = search
    ? sources.filter((source) =>
        `${source.title} ${source.description} ${source.author}`
          .toLocaleLowerCase()
          .includes(search),
      )
    : [];
  return (
    <Dialog
      open
      onClose={onClose}
      title="Найдите свой следующий шаг"
      className="search-dialog"
      initialFocusRef={inputRef}
    >
      <label className="search-input">
        <Search size={20} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Хирагана, частицы, первые слова…"
          aria-label="Поиск по урокам и источникам"
        />
      </label>
      <div className="eyebrow search-heading">
        {search ? `Найдено: ${results.length + books.length}` : 'Занятия в вашей программе'}
      </div>
      <div className="search-results">
        {results.map((lesson) => (
          <Link key={lesson.id} to={`/lesson/${lesson.id}`} onClick={onClose}>
            <span className="search-symbol" lang="ja">
              {lesson.japaneseTitle.slice(0, 1)}
            </span>
            <span>
              <strong>{lesson.title}</strong>
              <small>{lesson.description}</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        ))}
        {books.map((source) => (
          <Link key={source.id} to={`/library#${source.id}`} onClick={onClose}>
            <span className="search-symbol">
              <BookOpen size={21} />
            </span>
            <span>
              <strong>{source.title}</strong>
              <small>Источник · {source.license}</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        ))}
        {results.length + books.length === 0 && (
          <p className="search-empty">
            Ничего не нашли. Попробуйте «хирагана», «катакана» или «предложения».
          </p>
        )}
      </div>
      <div className="dialog-footnote">
        Поиск только по опубликованным занятиям и отобранным источникам.
      </div>
    </Dialog>
  );
}
