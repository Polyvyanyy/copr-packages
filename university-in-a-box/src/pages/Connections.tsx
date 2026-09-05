import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Lightbulb, Network } from 'lucide-react';
import { Link } from 'react-router';
import { useLearning } from '../learning-context';
import { SectionTitle } from '../components/ui';
import { connections } from '../domain/connections';

export function Connections() {
  const [openId, setOpenId] = useState<string | null>(connections[0].id);
  return (
    <div>
      <SectionTitle
        eyebrow="ROOMMATE · ДУМАТЬ ЧУТЬ ШИРЕ"
        title="Знакомое помогает понять новое."
        description="Небольшие мысленные эксперименты — рядом с вашей основной программой."
      />
      <div className="connections-intro">
        <span className="round-icon peach">
          <Network size={26} />
        </span>
        <div>
          <h2>Не ещё один урок. Другая точка зрения.</h2>
          <p>
            Здесь нет генератора фактов. Три фиксированные аналогии помогают обдумать изученное. У
            каждого сравнения есть границы — мы их не скрываем.
          </p>
        </div>
      </div>
      <div className="connection-list">
        {connections.map((connection, index) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            index={index}
            open={openId === connection.id}
            onToggle={() => setOpenId(openId === connection.id ? null : connection.id)}
          />
        ))}
      </div>
      <div className="connection-footer">
        <Lightbulb size={19} />
        <p>
          Аналогия — опора для размышления, а не источник доказательств. Проверяйте языковые правила
          по материалам занятия.
        </p>
        <Link to="/library" className="text-link">
          К источникам
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  index,
  open,
  onToggle,
}: {
  connection: (typeof connections)[number];
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { state, setState, notify } = useLearning();
  const [reflection, setReflection] = useState(state.reflections[connection.id] ?? '');
  const saved = reflection.trim().length > 0 && state.reflections[connection.id] === reflection;
  return (
    <article className={`connection-card ${open ? 'open' : ''}`}>
      <button
        className="connection-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`connection-${connection.id}`}
      >
        <span className="connection-glyph" lang="ja">
          {connection.glyph}
        </span>
        <span>
          <span className="eyebrow">
            0{index + 1} · {connection.label}
          </span>
          <strong>{connection.title}</strong>
        </span>
        <ChevronDown size={20} />
      </button>
      {open && (
        <div className="connection-body" id={`connection-${connection.id}`}>
          <h2>{connection.question}</h2>
          <p>{connection.explanation}</p>
          <div className="analogy-boundary">
            <span className="eyebrow">ГДЕ СРАВНЕНИЕ ПЕРЕСТАЁТ РАБОТАТЬ</span>
            <p>{connection.boundary}</p>
          </div>
          <label className="reflection-label" htmlFor={`reflection-${connection.id}`}>
            А какое сравнение помогает вам?
          </label>
          <textarea
            id={`reflection-${connection.id}`}
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            maxLength={2000}
            placeholder="Своя ассоциация, вопрос или небольшое открытие…"
          />
          <div className="reflection-actions">
            <button
              className="button secondary"
              disabled={!reflection.trim() || saved}
              onClick={() => {
                setState((previous) => ({
                  ...previous,
                  reflections: { ...previous.reflections, [connection.id]: reflection },
                }));
                notify('Размышление сохранено на этом устройстве');
              }}
            >
              <Check size={16} />
              {saved ? 'Заметка сохранена' : 'Сохранить заметку'}
            </button>
            <Link className="text-link" to={`/lesson/${connection.lessonId}`}>
              К связанному занятию
              <ArrowRight size={16} />
            </Link>
          </div>
          <p className="small muted">Личная заметка не оценивается и не меняет прогресс занятий.</p>
        </div>
      )}
    </article>
  );
}
