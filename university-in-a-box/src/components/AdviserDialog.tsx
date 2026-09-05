import { useState } from 'react';
import { ArrowRight, Check, Compass, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router';
import { diagnosticQuestions, lessons } from '../domain/curriculum';
import { DIAGNOSTIC_SKIP_ANSWER_ID, getDiagnosticResult } from '../domain/progress';
import { useLearning } from '../learning-context';
import type { LearningState } from '../domain/types';
import { Dialog, ProgressBar } from './ui';

export function AdviserDialog({
  onClose,
  startDiagnostic = false,
}: {
  onClose: () => void;
  startDiagnostic?: boolean;
}) {
  const { state, setState, notify } = useLearning();
  const navigate = useNavigate();
  const [step, setStep] = useState<'goal' | 'intro' | 'test' | 'result'>(
    startDiagnostic ? 'intro' : 'goal',
  );
  const [goal, setGoal] = useState(state.goal);
  const [answers, setAnswers] = useState<string[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const question = diagnosticQuestions[answers.length];
  const diagnosticResult = getDiagnosticResult(answers);
  const recommended =
    lessons.find((lesson) => lesson.id === diagnosticResult.recommendedLessonId) ?? lessons[0];

  function next(answer: string) {
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);
    setChoice(null);
    if (nextAnswers.length === diagnosticQuestions.length) setStep('result');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={step === 'goal' ? 'Учиться в своём ритме' : 'Найдём вашу точку старта'}
      className="adviser-dialog"
    >
      {step === 'goal' && (
        <>
          <div className="dialog-intro">
            <span className="round-icon">
              <Leaf size={23} />
            </span>
            <p>Небольшой, посильный план лучше идеального, к которому трудно вернуться.</p>
          </div>
          <fieldset>
            <legend>Что для вас сейчас важнее?</legend>
            <div className="choice-stack">
              {[
                ['foundation', 'Разобраться в основах', 'От первых знаков к простым предложениям'],
                ['reading', 'Читать по-японски', 'Узнавать слова и понимать короткие тексты'],
                ['writing', 'Выражать мысли письменно', 'Собирать предложения и замечать ошибки'],
              ].map(([value, title, subtitle]) => (
                <label
                  className={`choice-card ${goal.purpose === value ? 'selected' : ''}`}
                  key={value}
                >
                  <input
                    type="radio"
                    name="purpose"
                    value={value}
                    checked={goal.purpose === value}
                    onChange={() =>
                      setGoal({ ...goal, purpose: value as LearningState['goal']['purpose'] })
                    }
                  />
                  <span>
                    <strong>{title}</strong>
                    <small>{subtitle}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Сколько времени в день?</legend>
            <div className="segmented">
              {[10, 20, 30].map((minutes) => (
                <button
                  key={minutes}
                  className={goal.minutesPerDay === minutes ? 'active' : ''}
                  aria-pressed={goal.minutesPerDay === minutes}
                  onClick={() => setGoal({ ...goal, minutesPerDay: minutes })}
                >
                  {minutes} минут
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Дней в неделю</legend>
            <div className="segmented">
              {[3, 4, 5, 7].map((days) => (
                <button
                  key={days}
                  className={goal.daysPerWeek === days ? 'active' : ''}
                  aria-pressed={goal.daysPerWeek === days}
                  onClick={() => setGoal({ ...goal, daysPerWeek: days })}
                >
                  {days}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="dialog-actions">
            <button
              className="button primary"
              onClick={() => {
                setState((previous) => ({ ...previous, goal }));
                notify('Ваш учебный ритм сохранён');
                onClose();
              }}
            >
              Сохранить план
              <Check size={17} />
            </button>
            <button
              className="button ghost"
              onClick={() => {
                setState((previous) => ({ ...previous, goal }));
                setStep('intro');
              }}
            >
              Уточнить начальный уровень
            </button>
          </div>
        </>
      )}
      {step === 'intro' && (
        <div className="diagnostic-intro">
          <div className="big-icon">
            <Compass size={36} strokeWidth={1.3} />
          </div>
          <h3>Начнём с того, что вы уже знаете</h3>
          <p>
            Пять вопросов о японском письме. Если ответ пока незнаком, спокойно выбирайте «Не знаю».
          </p>
          <div className="soft-note">
            Это короткий ориентир, не экзамен. Он не засчитывает уроки и не присваивает языковой
            уровень.
          </div>
          <button className="button primary" onClick={() => setStep('test')}>
            Начать диагностику
            <ArrowRight size={18} />
          </button>
          <span className="muted small">Около 3 минут · без ограничения времени</span>
        </div>
      )}
      {step === 'test' && question && (
        <div className="diagnostic-test">
          <div className="line-between small muted">
            <span>
              Вопрос {answers.length + 1} из {diagnosticQuestions.length}
            </span>
            <span>Adviser · точка старта</span>
          </div>
          <ProgressBar
            value={(answers.length / diagnosticQuestions.length) * 100}
            label="Прогресс диагностики"
          />
          <h3>{question.prompt}</h3>
          {question.japanese && (
            <div className="question-japanese" lang="ja">
              {question.japanese}
            </div>
          )}
          <div className="answer-options">
            {question.options.map((option) => (
              <button
                key={option.id}
                className={`answer-option ${choice === option.id ? 'selected' : ''}`}
                aria-pressed={choice === option.id}
                onClick={() => setChoice(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="dialog-actions">
            <button
              className="button primary"
              disabled={choice === null}
              onClick={() => choice !== null && next(choice)}
            >
              {answers.length === diagnosticQuestions.length - 1
                ? 'Посмотреть результат'
                : 'Следующий вопрос'}
              <ArrowRight size={17} />
            </button>
            <button className="button ghost" onClick={() => next(DIAGNOSTIC_SKIP_ANSWER_ID)}>
              Пока не знаю
            </button>
          </div>
        </div>
      )}
      {step === 'result' && (
        <div className="diagnostic-intro">
          <div className="big-icon">
            <Compass size={36} strokeWidth={1.3} />
          </div>
          <span className="eyebrow">
            Ваш ориентир · {diagnosticResult.correct} из {diagnosticResult.total}
          </span>
          <h3>Начнём с ближайшего непокрытого шага</h3>
          <p>
            Пять коротких ответов показывают только отдельные точки. Поэтому следующий урок
            выбирается консервативно: с самого раннего шага, для которого в этой выборке ещё нет
            ответа.
          </p>
          <div className="recommendation">
            <span className="japanese" lang="ja">
              {recommended.japaneseTitle}
            </span>
            <strong>{recommended.title}</strong>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setState((previous) => ({
                ...previous,
                diagnostic: {
                  ...diagnosticResult,
                  completedAt: new Date().toISOString(),
                  answerIds: [...answers],
                },
              }));
              onClose();
              navigate(`/lesson/${recommended.id}`);
            }}
          >
            Сохранить и начать
            <ArrowRight size={18} />
          </button>
          <p className="small muted">
            Это ориентир по небольшой выборке, а не проверка навыков и не подтверждение уровня.
          </p>
        </div>
      )}
    </Dialog>
  );
}
