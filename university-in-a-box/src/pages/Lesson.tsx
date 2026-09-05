import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { lessons, modules, sources } from '../domain/curriculum';
import { addAttempt, createAttempt, isLessonCompleted } from '../domain/progress';
import type { Answer, Attempt, Lesson as LessonData } from '../domain/types';
import { useLearning } from '../learning-context';
import { EmptyState, ProgressBar } from '../components/ui';

export function LessonPage() {
  const { lessonId } = useParams();
  const lesson = lessons.find((item) => item.id === lessonId);
  if (!lesson)
    return (
      <EmptyState
        mark={<BookOpen size={32} />}
        title="Такого занятия пока нет"
        description="В учебном плане собраны все доступные занятия."
        action={
          <Link className="button primary" to="/plan">
            Открыть план
          </Link>
        }
      />
    );
  return <LessonSession key={lesson.id} lesson={lesson} />;
}

function LessonSession({ lesson }: { lesson: LessonData }) {
  const { state, setState } = useLearning();
  const [phase, setPhase] = useState<'reading' | 'practice' | 'result'>('reading');
  const [mode, setMode] = useState<'learn' | 'test'>('learn');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const attemptId = useRef(crypto.randomUUID());
  const questionIndex = checked ? answers.length - 1 : answers.length;
  const question = lesson.exercises[questionIndex];
  const module = modules.find((item) => item.id === lesson.moduleId);
  const lessonSources = sources.filter((source) => lesson.sourceIds.includes(source.id));
  const nextLesson = lessons[lessons.indexOf(lesson) + 1];
  const previousLesson = lessons[lessons.indexOf(lesson) - 1];

  function startPractice(nextMode: 'learn' | 'test') {
    setMode(nextMode);
    setAnswers([]);
    setChoice(null);
    setChecked(false);
    setHint(false);
    setResult(null);
    attemptId.current = crypto.randomUUID();
    setPhase('practice');
  }

  function checkAnswer() {
    if (!question || choice === null || checked) return;
    const nextAnswers = [...answers, { exerciseId: question.id, choiceId: choice, assisted: hint }];
    setAnswers(nextAnswers);
    if (mode === 'test') {
      if (nextAnswers.length === lesson.exercises.length) finish(nextAnswers);
      else setChoice(null);
    } else setChecked(true);
  }

  function finish(finalAnswers: Answer[]) {
    const attempt = createAttempt(lesson, finalAnswers, new Date(), attemptId.current);
    setState((previous) => addAttempt(previous, attempt));
    setResult(attempt);
    setPhase('result');
  }

  function next() {
    if (answers.length === lesson.exercises.length) {
      finish(answers);
    } else {
      setChecked(false);
      setChoice(null);
      setHint(false);
    }
  }

  return (
    <div className="lesson-page">
      <Link className="back-link" to="/plan">
        <ArrowLeft size={15} />
        {module?.title ?? 'Учебный план'}
      </Link>
      <div className="lesson-title-row">
        <div>
          <div className="eyebrow">
            ЗАНЯТИЕ {String(lessons.indexOf(lesson) + 1).padStart(2, '0')} · ОТ ЗНАКА К СМЫСЛУ
          </div>
          <h1>{lesson.title}</h1>
          <p>{lesson.description}</p>
        </div>
        <span className="lesson-title-mark" lang="ja">
          {lesson.japaneseTitle}
        </span>
      </div>
      <div className="lesson-meta-row">
        <span>
          <Clock size={15} />
          {lesson.durationMinutes} минут
        </span>
        <span>
          <Target size={15} />
          {lesson.exercises.length} заданий
        </span>
        <span>
          <ShieldCheck size={15} />
          Фиксированные материалы и ключи
        </span>
      </div>
      <div className="lesson-layout">
        <div className="lesson-main">
          <div className="lesson-tabs" aria-label="Режим занятия">
            <button
              className={phase === 'reading' ? 'active' : ''}
              aria-pressed={phase === 'reading'}
              onClick={() => setPhase('reading')}
            >
              <BookOpen size={17} />
              Разобраться
            </button>
            <button
              className={phase === 'practice' && mode === 'learn' ? 'active' : ''}
              aria-pressed={phase === 'practice' && mode === 'learn'}
              onClick={() => startPractice('learn')}
            >
              <Lightbulb size={17} />
              Научи меня
            </button>
            <button
              className={phase === 'practice' && mode === 'test' ? 'active' : ''}
              aria-pressed={phase === 'practice' && mode === 'test'}
              onClick={() => startPractice('test')}
            >
              <Target size={17} />
              Проверь меня
            </button>
          </div>
          {phase === 'reading' && (
            <article className="lesson-reading">
              {previousLesson && !isLessonCompleted(previousLesson, state.attempts) && (
                <div className="soft-note prerequisite-note">
                  <BookOpen size={17} />
                  <div>
                    Если встретятся незнакомые записи, сначала вернитесь к занятию{' '}
                    <Link className="text-link" to={`/lesson/${previousLesson.id}`}>
                      «{previousLesson.title}»
                    </Link>
                    . Все занятия доступны, но план удобнее проходить по порядку.
                  </div>
                </div>
              )}
              <div className="learning-objectives">
                <span className="eyebrow">ПОСЛЕ ЭТОГО ЗАНЯТИЯ ВЫ СМОЖЕТЕ</span>
                <ul>
                  {lesson.objectives.map((objective) => (
                    <li key={objective}>
                      <Check size={15} />
                      {objective}
                    </li>
                  ))}
                </ul>
              </div>
              {lesson.blocks.map((block, index) => (
                <section className="reading-block" key={block.title}>
                  <span className="reading-block-number">0{index + 1}</span>
                  <h2>{block.title}</h2>
                  <p>{block.body}</p>
                  {block.examples && (
                    <div
                      className={`example-grid ${block.examples.length > 3 ? 'many-examples' : ''}`}
                    >
                      {block.examples.map((example) => (
                        <div
                          className="example-card"
                          key={`${example.japanese}-${example.meaning}`}
                        >
                          <span className="example-japanese" lang="ja">
                            {example.japanese}
                          </span>
                          {example.reading && (
                            <span className="example-reading">{example.reading}</span>
                          )}
                          <span className="example-meaning">{example.meaning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
              <div className="reading-complete">
                <div>
                  <h3>Теперь попробуйте сами.</h3>
                  <p>Не обязательно помнить всё с первого раза.</p>
                </div>
                <button className="button primary" onClick={() => startPractice('learn')}>
                  Перейти к практике
                  <ArrowRight size={17} />
                </button>
              </div>
            </article>
          )}
          {phase === 'practice' && question && (
            <section className="exercise-panel" aria-label="Задание">
              <div className="line-between">
                <span className="eyebrow">
                  {mode === 'learn' ? 'ПРАКТИКА С ПОДДЕРЖКОЙ' : 'ПРОВЕРКА БЕЗ ПОДСКАЗОК'}
                </span>
                <span className="exercise-counter">
                  {questionIndex + 1} <span>/ {lesson.exercises.length}</span>
                </span>
              </div>
              <ProgressBar
                value={(questionIndex / lesson.exercises.length) * 100}
                label="Выполненные задания"
              />
              <h2>{question.prompt}</h2>
              {question.japanese && (
                <div className="question-japanese" lang="ja">
                  {question.japanese}
                </div>
              )}
              <div className="answer-options">
                {question.options.map((option, index) => {
                  const correct = checked && option.id === question.answerId;
                  const incorrect = checked && choice === option.id && !correct;
                  return (
                    <button
                      className={`answer-option ${choice === option.id ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}`}
                      key={option.id}
                      onClick={() => setChoice(option.id)}
                      disabled={checked}
                      aria-pressed={choice === option.id}
                    >
                      <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                      <span>{option.label}</span>
                      {correct && <Check size={19} />}
                      {incorrect && <X size={19} />}
                    </button>
                  );
                })}
              </div>
              {hint && !checked && (
                <div className="hint-box">
                  <Lightbulb size={19} />
                  <p>{question.hint}</p>
                </div>
              )}
              {checked && (
                <div
                  className={`answer-feedback ${choice === question.answerId ? 'success' : 'try-again'}`}
                  role="status"
                >
                  {choice === question.answerId ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <Lightbulb size={22} />
                  )}
                  <div>
                    <strong>
                      {choice === question.answerId
                        ? 'Да, именно так.'
                        : 'Давайте разберём этот момент.'}
                    </strong>
                    <p>{question.explanation}</p>
                  </div>
                </div>
              )}
              <div className="exercise-actions">
                {!checked ? (
                  <>
                    <button
                      className="button primary"
                      disabled={choice === null}
                      onClick={checkAnswer}
                    >
                      {mode === 'test'
                        ? questionIndex === lesson.exercises.length - 1
                          ? 'Завершить проверку'
                          : 'Сохранить и дальше'
                        : 'Проверить ответ'}
                      <ArrowRight size={17} />
                    </button>
                    {mode === 'learn' && (
                      <button
                        className="button ghost"
                        onClick={() => setHint(true)}
                        disabled={hint}
                      >
                        <Lightbulb size={16} />
                        Нужна подсказка
                      </button>
                    )}
                  </>
                ) : (
                  <button className="button primary" onClick={next}>
                    {answers.length === lesson.exercises.length
                      ? 'Посмотреть результат'
                      : 'Следующее задание'}
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
              <p className="exercise-disclaimer">
                {mode === 'test'
                  ? 'Ключи и разбор появятся только после всех ответов. Это учебная самопроверка, не экзамен.'
                  : 'Результат сохраняется после завершения всех заданий. Подсказки отмечаются отдельно.'}
              </p>
            </section>
          )}
          {phase === 'result' && result && (
            <section className="lesson-result">
              <span className="result-mark" lang="ja">
                一歩
              </span>
              <div className="eyebrow">ЕЩЁ ОДИН ШАГ СДЕЛАН</div>
              <h2>
                {result.correct / result.total >= 0.8 && !result.assisted
                  ? 'Хорошее начало понимания.'
                  : 'Теперь вы знаете, что повторить.'}
              </h2>
              <div className="result-score">
                {result.correct}
                <span> / {result.total}</span>
              </div>
              <p>
                Ответов по ключу{' '}
                {result.assisted ? '· с использованием подсказок' : '· без подсказок'}
              </p>
              <div className="soft-note">
                {result.assisted
                  ? 'Практика сохранена. Чтобы пройти занятие самостоятельно, повторите проверку без подсказок.'
                  : result.correct / result.total >= 0.8
                    ? 'Занятие пройдено в учебной проверке. Через неделю вернитесь к нему, чтобы проверить, что осталось в памяти.'
                    : 'Попробуйте ещё раз после чтения разбора. Для прохождения нужно не меньше 80% верных ответов без подсказок.'}
              </div>
              <div className="result-actions">
                <button className="button secondary" onClick={() => startPractice('test')}>
                  <RotateCcw size={16} />
                  Повторить без подсказок
                </button>
                <Link
                  className="button primary"
                  to={
                    nextLesson && result.correct / result.total >= 0.8 && !result.assisted
                      ? `/lesson/${nextLesson.id}`
                      : '/progress'
                  }
                >
                  {nextLesson && result.correct / result.total >= 0.8 && !result.assisted
                    ? 'Следующее занятие'
                    : 'Мой прогресс'}
                  <ArrowRight size={17} />
                </Link>
              </div>
              <p className="small muted">
                Это результат учебной практики на фиксированном наборе заданий, а не официальное
                подтверждение уровня японского.
              </p>
              <details className="result-review">
                <summary>Разобрать все ответы</summary>
                <ol>
                  {lesson.exercises.map((exercise) => {
                    const answer = result.answers.find((item) => item.exerciseId === exercise.id);
                    return (
                      <li key={exercise.id}>
                        <strong>{exercise.prompt}</strong>
                        <p>
                          Ваш ответ:{' '}
                          {exercise.options.find((option) => option.id === answer?.choiceId)
                            ?.label ?? '—'}{' '}
                          {answer?.choiceId === exercise.answerId ? '✓' : '· нужно повторить'}
                        </p>
                        <p>{exercise.explanation}</p>
                      </li>
                    );
                  })}
                </ol>
              </details>
            </section>
          )}
        </div>
        <aside className="lesson-aside">
          <section className="card tutor-card">
            <div className="tutor-heading">
              <span className="alter-avatar">T</span>
              <div>
                <strong>Ваш Tutor</strong>
                <span>Помогаем понять, а не угадать</span>
              </div>
            </div>
            <p>
              {phase === 'practice'
                ? mode === 'test'
                  ? 'Сейчас вы отвечаете без подсказок. Ключи и объяснения откроются после всех пяти ответов.'
                  : 'Сначала попробуйте сами. Если застряли, попросите одну небольшую подсказку.'
                : 'Читайте по одному блоку. Найдите знакомый знак, сравните примеры, затем проверьте себя.'}
            </p>
            <div className="tutor-tip">
              <Lightbulb size={18} />
              <span>
                {phase === 'practice' && mode === 'learn'
                  ? 'Подсказка помогает учиться, но такая попытка не считается самостоятельной.'
                  : 'Понимание растёт, когда вы можете объяснить себе, почему ответ подходит.'}
              </span>
            </div>
            <span className="tutor-mode">
              <span className="status-dot" />
              Фиксированные разборы · без генерации
            </span>
          </section>
          <section className="card aside-card">
            <h3>Источники занятия</h3>
            <p className="small muted">Можно проверить, откуда взялись материалы.</p>
            {lessonSources.map((source) => (
              <Link className="lesson-source-link" key={source.id} to={`/library#${source.id}`}>
                <BookOpen size={16} />
                <span>
                  {source.title}
                  <small>{source.license}</small>
                </span>
                <ChevronRight size={14} />
              </Link>
            ))}
          </section>
          <div className="lesson-quiet-note">
            <span lang="ja">少しずつ</span>
            <p>
              Понемногу.
              <br />
              Именно так складывается большое.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
