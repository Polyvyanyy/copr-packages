import { useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { Link } from 'react-router';
import { kanaRows } from '../domain/kana';
import { EmptyState, SectionTitle } from '../components/ui';

export function Kana() {
  const [script, setScript] = useState<'hiragana' | 'katakana'>('hiragana');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const normalized = query.trim().toLowerCase();
  const rows = kanaRows.filter(
    (row) =>
      (expanded || row.id.startsWith('base-')) &&
      (!normalized ||
        [...row.hiragana, ...row.katakana, ...row.romanization, row.label].some((value) =>
          value.toLowerCase().includes(normalized),
        )),
  );
  return (
    <div className="kana-page">
      <SectionTitle
        eyebrow="СПРАВОЧНИК · ДЕРЖИТЕ ПОД РУКОЙ"
        title="Две азбуки. Понятная система."
        description="46 базовых знаков каждой азбуки, диакритики и сочетания. Таблица помогает свериться, а не заменяет практику."
        action={
          <Link className="button secondary" to="/practice">
            К практике
            <ArrowRight size={17} />
          </Link>
        }
      />
      <div className="kana-controls">
        <div className="filter-chips" aria-label="Азбука">
          <button
            className={script === 'hiragana' ? 'active' : ''}
            aria-pressed={script === 'hiragana'}
            onClick={() => setScript('hiragana')}
          >
            Хирагана <span lang="ja">あ</span>
          </button>
          <button
            className={script === 'katakana' ? 'active' : ''}
            aria-pressed={script === 'katakana'}
            onClick={() => setScript('katakana')}
          >
            Катакана <span lang="ja">ア</span>
          </button>
        </div>
        <label className="kana-search">
          <Search size={16} />
          <span className="sr-only">Найти знак или транскрипцию</span>
          <input
            type="search"
            placeholder="Знак или письменная транскрипция"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <label className="kana-extra">
        <input
          type="checkbox"
          checked={expanded}
          onChange={(event) => setExpanded(event.target.checked)}
        />
        Показать диакритики, сочетания и малые знаки
      </label>
      <section
        className="card kana-table"
        aria-label={script === 'hiragana' ? 'Таблица хираганы' : 'Таблица катаканы'}
      >
        {rows.map((row) => (
          <div className="kana-row" key={row.id}>
            <div className="kana-row-label">
              <strong>{row.label}</strong>
              <Link to={`/lesson/${row.lessonId}`} className="text-link">
                Разобрать
                <ArrowRight size={13} />
              </Link>
            </div>
            <div className="kana-cells">
              {row[script].map((sign, index) => (
                <div className="kana-cell" key={`${row.id}-${index}`}>
                  <strong lang="ja">{sign}</strong>
                  <span>{row.romanization[index]}</span>
                  <small lang="ja">
                    {row[script === 'hiragana' ? 'katakana' : 'hiragana'][index]}
                  </small>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
      {rows.length === 0 && (
        <EmptyState
          mark={<Search size={30} />}
          title="Такой записи в выбранной таблице нет"
          description="Попробуйте другой запрос или включите дополнительные знаки."
          action={
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setExpanded(true);
              }}
            >
              Показать все знаки
            </button>
          }
        />
      )}
      <div className="soft-note">
        <p>
          Латиница здесь — письменная транскрипция. Частицы は・へ・を и выбор знаков для долгих
          гласных разбираются отдельно в уроках. Для самостоятельной проверки закройте справочник:
          просмотр таблицы не подтверждает усвоение.
        </p>
      </div>
    </div>
  );
}
