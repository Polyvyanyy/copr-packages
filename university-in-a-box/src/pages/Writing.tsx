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
import { Link, useSearchParams } from 'react-router';
import {
  getWritingDraft,
  getWritingHistory,
  reviewWritingAssignment,
  updateWritingDraft,
} from '../domain/progress';
import { getWritingAssignment, writingAssignments } from '../domain/writing-assignments';
import type { WritingAssignment } from '../domain/writing-assignments';
import type { WritingVersion } from '../domain/types';
import { useLearning } from '../learning-context';
import { Dialog, SectionTitle, shortDate } from '../components/ui';
import { useProduct } from '../product-context';

function JapaneseText({ children }: { children: string }) {
  return children
    .split(/([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々。、！？]+)/u)
    .map((part, index) =>
      index % 2 ? (
        <span lang="ja" key={index}>
          {part}
        </span>
      ) : (
        part
      ),
    );
}

export function Writing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const assignment = getWritingAssignment(searchParams.get('assignment') ?? 'introduction');

  return (
    <div className="writing-page">
      <SectionTitle
        eyebrow="ПИСЬМО · МЫСЛЬ НА БУМАГЕ"
        title="Мысль обретает форму."
        description="Пишите, замечайте детали и возвращайтесь к своим первым строчкам."
      />
      <div className="writing-assignment-picker">
        <label htmlFor="writing-assignment-select">Выберите задание</label>
        <select
          id="writing-assignment-select"
          value={assignment?.id ?? ''}
          aria-describedby="writing-assignment-note"
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            next.set('assignment', event.target.value);
            setSearchParams(next);
          }}
        >
          {!assignment && (
            <option value="" disabled>
              Выберите доступное задание
            </option>
          )}
          {writingAssignments.map((item, index) => (
            <option value={item.id} key={item.id}>
              {String(index + 1).padStart(2, '0')} · {item.title}
            </option>
          ))}
        </select>
        <p className="small muted" id="writing-assignment-note">
          {writingAssignments.length} задания · у каждого свой черновик и история.
        </p>
      </div>
      {assignment ? (
        <WritingWorkspace key={assignment.id} assignment={assignment} />
      ) : (
        <div className="soft-note" role="status">
          <p>Такого письменного задания нет. Выберите одно из списка — ваши тексты сохранены.</p>
        </div>
      )}
    </div>
  );
}

function WritingWorkspace({ assignment }: { assignment: WritingAssignment }) {
  const { state, setState, notify, syncStatus, storageError } = useLearning();
  const { account } = useProduct();
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [version, setVersion] = useState<WritingVersion | null>(null);
  const draft = getWritingDraft(state, assignment.id);
  const history = getWritingHistory(state, assignment.id);
  const feedback =
    checkedText === null ? null : reviewWritingAssignment(checkedText, assignment.id);
  const outdated = checkedText !== null && checkedText !== draft;
  const checked = feedback !== null && !outdated;
  const checks = checked
    ? feedback.checks
    : assignment.checks.map(({ id, label }) => ({ id, label, passed: false }));

  function saveVersion() {
    if (!draft.trim()) return;
    if (history.at(-1)?.text === draft) {
      notify('Эта версия уже сохранена');
      return;
    }
    const nextVersion: WritingVersion = {
      id: crypto.randomUUID(),
      text: draft,
      createdAt: new Date().toISOString(),
      ...(assignment.id === 'introduction' ? {} : { assignmentId: assignment.id }),
    };
    setState((previous) => ({
      ...previous,
      writingHistory: [...previous.writingHistory, nextVersion].slice(-100),
    }));
    notify(
      account
        ? 'Версия добавлена в историю; статус серверного сохранения — сверху'
        : 'Версия сохранена в истории работ',
    );
  }

  return (
    <>
      <div className="writing-layout">
        <div className="writing-main">
          <section className="writing-assignment" aria-labelledby="writing-assignment-title">
            <span className="assignment-number" aria-hidden="true">
              {String(writingAssignments.indexOf(assignment) + 1).padStart(2, '0')}
            </span>
            <div>
              <span className="eyebrow">ПИСЬМЕННАЯ РАБОТА</span>
              <h2 id="writing-assignment-title">{assignment.title}</h2>
              <p>
                <JapaneseText>{assignment.description}</JapaneseText>
              </p>
              <p className="writing-model" lang="ja">
                {assignment.model}
              </p>
              <Link className="text-link" to={`/lesson/${assignment.lessonId}`}>
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
                {draft
                  ? storageError
                    ? 'Есть несохранённые изменения — см. статус сверху'
                    : account
                      ? syncStatus === 'synced'
                        ? 'Сохранено в аккаунте'
                        : 'Ожидает серверного сохранения'
                      : 'Сохраняется в этом браузере'
                  : 'Начните с одной строчки'}
              </span>
            </div>
            <textarea
              id="writing-draft"
              className="writing-textarea"
              lang="ja"
              spellCheck={false}
              maxLength={2000}
              value={draft}
              placeholder={assignment.model}
              onChange={(event) => {
                const text = event.target.value;
                setState((previous) => updateWritingDraft(previous, assignment.id, text));
              }}
              aria-describedby="writing-assignment-title writing-local-note"
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
                <span lang="ja">{assignment.example}</span>
                <p>«{assignment.exampleMeaning}» Сверьтесь с образцом и условиями задания.</p>
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
            {account
              ? 'Черновик синхронизируется с вашим аккаунтом.'
              : 'Черновик хранится только на этом устройстве.'}{' '}
            Не указывайте личные данные: используйте слова и имена из задания.
          </p>
          <section className="writing-history" aria-labelledby="writing-history-heading">
            <div className="section-heading">
              <h2 id="writing-history-heading">Как менялся ваш текст</h2>
              <span className="small muted">Версий в этом задании: {history.length}</span>
            </div>
            {history.length ? (
              <div className="card">
                {[...history]
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
              Здесь — до 10 последних версий выбранного задания. Общий лимит — 100 версий для всех
              заданий. Вся сохранённая история доступна в экспорте на странице прогресса.
            </p>
          </section>
        </div>
        <aside className="writing-aside">
          <section className="card editor-feedback">
            <div className="tutor-heading">
              <span className="alter-avatar peach" aria-hidden="true">
                <NotebookPen size={17} />
              </span>
              <div>
                <strong>Проверка по условиям</strong>
                <span>Только то, что можно проверить</span>
              </div>
            </div>
            <h3>{checked ? 'Сверим с заданием' : 'Сначала — ваша мысль'}</h3>
            <p>
              {outdated
                ? 'Текст изменился. Проверьте условия ещё раз, чтобы обновить разбор.'
                : 'Проверка ищет только конструкции из списка. Смысл и остальную грамматику она не оценивает.'}
            </p>
            <div
              className="writing-checks"
              role="list"
              aria-label="Условия задания"
              aria-live="polite"
            >
              {checks.map((check) => (
                <div className={check.passed ? 'passed' : ''} role="listitem" key={check.id}>
                  {check.passed ? (
                    <Check size={18} aria-hidden="true" />
                  ) : (
                    <Circle size={16} aria-hidden="true" />
                  )}
                  <span>
                    <span className="sr-only">
                      {checked
                        ? check.passed
                          ? 'Выполнено: '
                          : 'Не выполнено: '
                        : 'Не проверено: '}
                    </span>
                    <JapaneseText>{check.label}</JapaneseText>
                  </span>
                </div>
              ))}
            </div>
            {checked && (
              <div className="editor-notes" role="status">
                {feedback.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
            <div className="soft-note">
              <Lightbulb size={18} />
              <span>
                Все отметки не означают «ошибок нет». Это формальная самопроверка, не оценка
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
              {shortDate(version.createdAt)} · {assignment.title}
            </p>
            <p className="small muted">
              {account
                ? 'История синхронизируется с аккаунтом; статус сохранения — сверху.'
                : storageError
                  ? 'Версия доступна в этой вкладке. Экспортируйте данные перед её закрытием.'
                  : 'История хранится в этом браузере.'}
            </p>
            <div className="version-preview" lang="ja">
              {version.text}
            </div>
            <p className="muted">
              Восстановление заменит черновик только этого задания. Сохранённые версии и черновики
              других заданий останутся без изменений.
            </p>
            <div className="dialog-actions">
              <button
                className="button primary"
                onClick={() => {
                  setState((previous) => updateWritingDraft(previous, assignment.id, version.text));
                  setCheckedText(null);
                  setExampleOpen(false);
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
    </>
  );
}
