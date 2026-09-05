import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Flag,
  Leaf,
  SlidersHorizontal,
} from 'lucide-react';
import { Link } from 'react-router';
import { lessons, modules } from '../domain/curriculum';
import { getCourseStats, getLessonStatus, isLessonCompleted } from '../domain/progress';
import { useLearning } from '../learning-context';
import { AdviserDialog } from '../components/AdviserDialog';
import { ProgressBar, SectionTitle, plural } from '../components/ui';

export const statusLabels = {
  new: 'Ещё впереди',
  practising: 'В практике',
  completed: 'Пройдено',
  'review-due': 'Пора повторить',
  retained: 'Повторено с отсрочкой',
};

export function Plan() {
  const { state } = useLearning();
  const [adviser, setAdviser] = useState<'goal' | 'diagnostic' | null>(null);
  const stats = getCourseStats(state, lessons);
  const purpose = {
    foundation: 'Понять основу японского письма',
    reading: 'Читать первые японские тексты',
    writing: 'Писать простые предложения',
  }[state.goal.purpose];
  return (
    <div>
      <SectionTitle
        eyebrow="ADVISER · ВАШ МАРШРУТ"
        title="От первого знака — к смыслу."
        description="Понятная последовательность. Никакой спешки и случайных тем."
        action={
          <button className="button secondary" onClick={() => setAdviser('goal')}>
            <SlidersHorizontal size={17} />
            Настроить план
          </button>
        }
      />
      <div className="plan-overview">
        <span className="round-icon">
          <Compass size={24} />
        </span>
        <div>
          <span className="eyebrow">ВАША ЦЕЛЬ</span>
          <h2>{purpose}</h2>
          <p>
            {state.goal.minutesPerDay} минут в день ·{' '}
            {plural(state.goal.daysPerWeek, ['день', 'дня', 'дней'])} в неделю ·{' '}
            {plural(lessons.length, ['занятие', 'занятия', 'занятий'])}
          </p>
        </div>
        <div className="plan-total">
          <strong>
            {stats.completed}
            <span>/{stats.total}</span>
          </strong>
          <span>занятий пройдено</span>
          <ProgressBar value={stats.percentage} label="Пройденные занятия программы" />
        </div>
      </div>
      <div className="content-with-aside">
        <div className="curriculum-list">
          {modules.map((module, index) => {
            const moduleLessons = lessons.filter((lesson) => module.lessonIds.includes(lesson.id));
            const done = moduleLessons.filter((lesson) =>
              isLessonCompleted(lesson, state.attempts),
            ).length;
            return (
              <section className="curriculum-module" id={module.id} key={module.id}>
                <div className="curriculum-module-heading">
                  <span className="large-module-number">0{index + 1}</span>
                  <div>
                    <span className="eyebrow">
                      РАЗДЕЛ {index + 1} ·{' '}
                      {moduleLessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0)} МИНУТ
                    </span>
                    <h2>{module.title}</h2>
                    <p>{module.description}</p>
                  </div>
                  <span className="module-heading-glyph" lang="ja">
                    {['あ', 'ア', '文'][index]}
                  </span>
                </div>
                <div className="lesson-list">
                  {moduleLessons.map((lesson, lessonIndex) => {
                    const status = getLessonStatus(lesson, state.attempts);
                    const done = isLessonCompleted(lesson, state.attempts);
                    return (
                      <Link className="lesson-row" key={lesson.id} to={`/lesson/${lesson.id}`}>
                        <span className={`lesson-step ${done ? 'done' : ''}`}>
                          {done ? <Check size={17} /> : String(lessonIndex + 1).padStart(2, '0')}
                        </span>
                        <span className="lesson-row-copy">
                          <strong>{lesson.title}</strong>
                          <span>{lesson.objectives[0]}</span>
                        </span>
                        <span className={`lesson-row-status ${done ? 'green-text' : ''}`}>
                          {statusLabels[status]}
                        </span>
                        <span className="lesson-time">
                          <Clock size={13} />
                          {lesson.durationMinutes} мин
                        </span>
                        <ChevronRight size={17} />
                      </Link>
                    );
                  })}
                </div>
                <div className="module-footer">
                  <span>
                    {done} из {moduleLessons.length} занятий пройдено
                  </span>
                  <ProgressBar
                    value={(done / moduleLessons.length) * 100}
                    label={`Прогресс раздела ${module.title}`}
                  />
                </div>
              </section>
            );
          })}
        </div>
        <aside className="plan-aside">
          <section className="card aside-card">
            <div className="section-heading">
              <h3>Точка старта</h3>
              <Compass size={18} />
            </div>
            {state.diagnostic ? (
              <>
                <span className="pill green">Диагностика пройдена</span>
                <p>
                  Ответов по ключу: {state.diagnostic.correct} из {state.diagnostic.total}. Это
                  ориентир, а не зачёт занятий.
                </p>
              </>
            ) : (
              <p>Уже знаете некоторые знаки? Короткая диагностика поможет выбрать начало.</p>
            )}
            <button className="text-link" onClick={() => setAdviser('diagnostic')}>
              {state.diagnostic ? 'Пройти ещё раз' : 'Найти точку старта'}
              <ArrowRight size={16} />
            </button>
          </section>
          <section className="card aside-card">
            <div className="section-heading">
              <h3>Что будет на выходе</h3>
              <Flag size={17} />
            </div>
            <ul className="milestone-list">
              <li>
                <span>01</span>Узнавать изученные знаки хираганы и катаканы.
              </li>
              <li>
                <span>02</span>Читать первые слова и замечать знакомые формы.
              </li>
              <li>
                <span>03</span>Составить простое письменное представление о себе.
              </li>
            </ul>
            <Link to="/writing" className="text-link">
              Итоговая работа
              <ArrowRight size={16} />
            </Link>
          </section>
          <div className="plan-note">
            <Leaf size={24} strokeWidth={1.5} />
            <h3>Достаточно одного шага.</h3>
            <p>
              Версия 1: семь вводных занятий, не весь японский язык. Сложные кандзи и длинные тексты
              пока оставим за её пределами.
            </p>
          </div>
        </aside>
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
