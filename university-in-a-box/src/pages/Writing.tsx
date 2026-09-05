import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  FileClock,
  Lightbulb,
  NotebookPen,
  Save,
} from 'lucide-react';
import { Link } from 'react-router';
import { reviewWriting } from '../domain/progress';
import type { WritingVersion } from '../domain/types';
import { useLearning } from '../learning-context';
import { Dialog, SectionTitle, shortDate } from '../components/ui';

export function Writing() {
  const { state, setState, notify } = useLearning();
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [version, setVersion] = useState<WritingVersion | null>(null);
  const draft = state.writingDraft;
  const feedback = checkedText === null ? null : reviewWriting(checkedText);
  const outdated = checkedText !== null && checkedText !== draft;

  function saveVersion() {
    if (!draft.trim()) return;
    if (state.writingHistory.at(-1)?.text === draft) {
      notify('Эта версия уже сохранена');
      return;
    }
    const nextVersion = {
      id: crypto.randomUUID(),
      text: draft,
      createdAt: new Date().toISOString(),
    };
    setState((previous) => ({
      ...previous,
      writingHistory: [...previous.writingHistory, nextVersion].slice(-100),
    }));
    notify('Версия сохранена в истории работ');
  }

  return (
    <div>
      <SectionTitle
        eyebrow="EDITOR · МЫСЛЬ НА БУМАГЕ"
        title="Мысль обретает форму."
        description="Пишите, замечайте детали и возвращайтесь к своим первым строчкам."
      />
      <div className="writing-layout">
        <div className="writing-main">
          <section className="writing-assignment">
            <span className="assignment-number">01</span>
            <div>
              <span className="eyebrow">ПИСЬМЕННАЯ РАБОТА</span>
              <h2>Несколько слов о себе</h2>
              <p>
                Представьтесь одним коротким предложением по модели{' '}
                <span lang="ja">わたしは … です。</span> Используйте имя из образца: あき (Аки) или
                みき (Мики).
              </p>
              <Link className="text-link" to="/lesson/self-introduction">
                Вернуться к занятию
                <ArrowRight size={15} />
              </Link>
            </div>
          </section>
          <section className="writing-editor card">
            <div className="editor-toolbar">
              <label htmlFor="writing-draft">
                <NotebookPen size={17} />
                Ваш черновик
              </label>
              <span className="small muted">
                {state.writingDraft ? 'Сохраняется в этом браузере' : 'Начните с одной строчки'}
              </span>
            </div>
            <textarea
              id="writing-draft"
              className="writing-textarea"
              lang="ja"
              spellCheck={false}
              maxLength={2000}
              value={draft}
              placeholder="わたしは … です。"
              onChange={(event) =>
                setState((previous) => ({ ...previous, writingDraft: event.target.value }))
              }
              aria-describedby="writing-local-note"
            />
            <div className="editor-bottom">
              <span className="small muted">{draft.length} / 2000 символов</span>
              <button
                className="quiet-button"
                aria-expanded={exampleOpen}
                aria-controls="writing-example"
                onClick={() => setExampleOpen(!exampleOpen)}
              >
                <Lightbulb size={15} />
                {exampleOpen ? 'Скрыть образец' : 'Посмотреть образец'}
              </button>
            </div>
            {exampleOpen && (
              <div className="writing-example" id="writing-example">
                <span lang="ja">わたしは あき です。</span>
                <p>
                  «Я — Аки». Пробелы оставлены для наглядности; это пример, а не ваш готовый ответ.
                </p>
              </div>
            )}
          </section>
          <div className="writing-actions">
            <button
              className="button primary"
              disabled={!draft.trim()}
              onClick={() => setCheckedText(draft)}
            >
              Проверить условия
              <ArrowRight size={16} />
            </button>
            <button className="button secondary" disabled={!draft.trim()} onClick={saveVersion}>
              <Save size={16} />
              Сохранить версию
            </button>
          </div>
          <p className="small muted" id="writing-local-note">
            Черновик хранится только на этом устройстве. Не указывайте личные данные: для упражнения
            достаточно вымышленного имени.
          </p>
          <section className="writing-history">
            <div className="section-heading">
              <h2>Как менялся ваш текст</h2>
              <span className="small muted">{state.writingHistory.length} / 100 версий</span>
            </div>
            {state.writingHistory.length ? (
              <div className="card">
                {[...state.writingHistory]
                  .reverse()
                  .slice(0, 10)
                  .map((item) => (
                    <button
                      className="writing-version-row"
                      key={item.id}
                      onClick={() => setVersion(item)}
                    >
                      <FileClock size={18} />
                      <span lang="ja">{item.text}</span>
                      <time dateTime={item.createdAt}>{shortDate(item.createdAt)}</time>
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
            ) : (
              <div className="history-placeholder">
                <FileClock size={22} />
                <p>Сохраните первую версию — она останется рядом с будущими работами.</p>
              </div>
            )}
            <p className="small muted">
              Показываем до 10 последних версий. Полная локальная история доступна в экспорте на
              странице прогресса.
            </p>
          </section>
        </div>
        <aside className="writing-aside">
          <section className="card editor-feedback">
            <div className="tutor-heading">
              <span className="alter-avatar peach">E</span>
              <div>
                <strong>Внимательный Editor</strong>
                <span>Только то, что можно проверить</span>
              </div>
            </div>
            <h3>{feedback && !outdated ? 'Сверим с заданием' : 'Сначала — ваша мысль'}</h3>
            <p>
              {outdated
                ? 'Текст изменился. Проверьте условия ещё раз, чтобы обновить разбор.'
                : 'Проверка ищет две конкретные конструкции. Смысл и остальную грамматику она не оценивает.'}
            </p>
            <div className="writing-checks" aria-live="polite">
              {feedback && !outdated ? (
                feedback.checks.map((check) => (
                  <div className={check.passed ? 'passed' : ''} key={check.id}>
                    {check.passed ? <Check size={18} /> : <Circle size={16} />}
                    <span>{check.label}</span>
                  </div>
                ))
              ) : (
                <>
                  <div>
                    <Circle size={16} />
                    <span>
                      Тема <span lang="ja">わたしは</span> или <span lang="ja">私は</span>
                    </span>
                  </div>
                  <div>
                    <Circle size={16} />
                    <span>
                      Модель «я — [имя]» с <span lang="ja">です</span>
                    </span>
                  </div>
                </>
              )}
            </div>
            {feedback && !outdated && (
              <div className="editor-notes" role="status">
                {feedback.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
            <div className="soft-note">
              <Lightbulb size={18} />
              <span>
                Даже две отметки не означают «ошибок нет». Это формальная самопроверка, не оценка
                владения языком.
              </span>
            </div>
          </section>
          <div className="writing-quote">
            <span lang="ja">
              書くことは、
              <br />
              考えること。
            </span>
            <p>Писать — значит думать.</p>
          </div>
        </aside>
      </div>
      <Dialog open={version !== null} onClose={() => setVersion(null)} title="Сохранённая версия">
        {version && (
          <>
            <p className="small muted">
              {shortDate(version.createdAt)} · текст остаётся на вашем устройстве
            </p>
            <div className="version-preview" lang="ja">
              {version.text}
            </div>
            <p className="muted">
              Восстановление заменит текущий черновик. Сохранённые версии останутся в истории.
            </p>
            <div className="dialog-actions">
              <button
                className="button primary"
                onClick={() => {
                  setState((previous) => ({ ...previous, writingDraft: version.text }));
                  setCheckedText(null);
                  setVersion(null);
                  notify('Версия восстановлена в черновике');
                }}
              >
                Заменить черновик этой версией
              </button>
              <button className="button ghost" onClick={() => setVersion(null)}>
                Отмена
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
