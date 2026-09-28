import { useEffect } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Leaf,
  NotebookPen,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router';
import { StudyArtwork } from '../components/Artwork';
import { plural } from '../components/ui';
import { COURSE_MANIFEST, lessons, modules } from '../domain/curriculum';
import { useProduct } from '../product-context';

const alterSteps = [
  [
    'A',
    'Adviser',
    'Советник',
    'Собирает последовательный маршрут и помогает выбрать следующий шаг.',
  ],
  [
    'L',
    'Librarian',
    'Библиотекарь',
    'Показывает источник, контекст и условия использования материала.',
  ],
  [
    'T',
    'Tutor',
    'Наставник',
    'Даёт короткую письменную задачу и объяснение к проверяемому ответу.',
  ],
  ['E', 'Editor', 'Редактор', 'Помогает заметить форму в черновике, не подменяя вашу мысль.'],
  ['R', 'Roommate', 'Связи', 'Добавляет фиксированные аналогии с честно обозначенными границами.'],
] as const;

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/welcome" aria-label="University in a Box · 日本語">
        <span className="public-brand-mark" lang="ja">
          日
        </span>
        <span>
          University in a Box
          <small lang="ja">日本語</small>
        </span>
      </Link>
      <nav className="public-nav" aria-label="Основная навигация">
        <Link to="/plan">Программа</Link>
        <Link to="/membership">Стоимость</Link>
        <Link to="/auth/sign-in">Войти</Link>
      </nav>
      <Link className="public-button public-button-small" to="/auth/sign-up">
        Об аккаунте <ArrowRight size={15} />
      </Link>
    </header>
  );
}

export function Welcome() {
  const { config } = useProduct();
  const lessonCount = lessons.length;
  const moduleCount = modules.length;
  const isExpandedCourse = lessonCount >= COURSE_MANIFEST.lessons;
  const billingDisabled = config?.billing.enabled === false;
  const operator = config?.operator;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '文字から、意味へ。 | University in a Box · 日本語';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="marketing-page">
      <a className="public-skip-link" href="#marketing-content">
        К содержанию
      </a>
      <PublicHeader />
      <main id="marketing-content">
        <section className="marketing-hero" aria-labelledby="marketing-title">
          <div className="marketing-hero-copy">
            <span className="marketing-kicker">
              <Leaf size={15} /> ПИСЬМЕННЫЙ ЯПОНСКИЙ · СПОКОЙНЫЙ ТЕМП
            </span>
            <h1 id="marketing-title">
              <span lang="ja">文字から、意味へ。</span>
              Японский, который хочется понимать на письме.
            </h1>
            <p className="marketing-lead">
              University in a Box · 日本語 — учебная среда для знаков, слов и первых фраз. Мы строим
              внимательную письменную основу, а не имитируем беглость.
            </p>
            <div className="marketing-actions">
              <Link className="public-button" to="/auth/sign-up">
                {config?.billing.enabled ? 'Начать 7 дней без карты' : 'Создать аккаунт'}{' '}
                <ArrowRight size={17} />
              </Link>
              <Link className="public-text-link" to="/lesson/hiragana-vowels">
                Посмотреть первый урок <ArrowUpRight size={16} />
              </Link>
            </div>
            <p className="marketing-disclaimer">
              Фокус — чтение и письмо. Это не подготовка к JLPT, не сертификационный курс и не
              обещание уровня владения языком.
            </p>
          </div>
          <div className="marketing-hero-visual">
            <StudyArtwork />
            <article className="marketing-reading-card" aria-label="Образец письменного задания">
              <div>
                <span>ПИСЬМЕННЫЙ ОБРАЗЕЦ</span>
                <strong>07</strong>
              </div>
              <p lang="ja">わたしは あき です。</p>
              <dl>
                <div>
                  <dt>форма</dt>
                  <dd lang="ja">わたしは … です。</dd>
                </div>
                <div>
                  <dt>смысл</dt>
                  <dd>«Я — Аки»</dd>
                </div>
              </dl>
              <span className="marketing-card-note">сначала увидеть · затем написать</span>
            </article>
          </div>
        </section>

        <section className="marketing-proof" aria-label="Принципы продукта">
          <p>
            Не ускоренный курс и не витрина обещаний. Это рабочее пространство, где у каждого текста
            есть место в маршруте, источник и понятная граница того, что он проверяет.
          </p>
          <ul>
            <li>
              <strong>{plural(moduleCount, ['раздел', 'раздела', 'разделов'])}</strong>
              <span>в текущей программе</span>
            </li>
            <li>
              <strong>{plural(lessonCount, ['урок', 'урока', 'уроков'])}</strong>
              доступны сейчас
            </li>
            <li>
              <strong>
                {isExpandedCourse ? 'полный контур' : `${COURSE_MANIFEST.lessons} уроков`}
              </strong>
              <span>{isExpandedCourse ? 'программа развёрнута' : 'ориентир расширения'}</span>
            </li>
          </ul>
        </section>

        <section
          className="marketing-section marketing-features"
          aria-labelledby="marketing-features-title"
        >
          <div className="marketing-section-heading">
            <span className="marketing-kicker">УЧЁБА БЕЗ ЧЁРНОГО ЯЩИКА</span>
            <h2 id="marketing-features-title">Меньше шума. Больше опор для мысли.</h2>
          </div>
          <div className="marketing-feature-grid">
            <article>
              <NotebookPen size={24} />
              <h3>Текст — в центре</h3>
              <p>
                Знаки, примеры и короткие черновики остаются перед глазами, пока вы их разбираете.
              </p>
            </article>
            <article>
              <BookOpen size={24} />
              <h3>Источники видны</h3>
              <p>
                У материалов есть автор, назначение и лицензия — их можно проверить в библиотеке.
              </p>
              <Link className="public-inline-link" to="/library">
                Открыть библиотеку <ArrowRight size={15} />
              </Link>
            </article>
            <article>
              <Sparkles size={24} />
              <h3>Прогресс не выдаётся за оценку</h3>
              <p>Повторение и самопроверка помогают учиться, но не подтверждают уровень языка.</p>
            </article>
          </div>
        </section>

        <section
          className="marketing-section marketing-course"
          aria-labelledby="marketing-course-title"
        >
          <div className="marketing-section-heading">
            <span className="marketing-kicker">КАРТА СЕГОДНЯ</span>
            <h2 id="marketing-course-title">Настоящий контур курса — без приукрашивания.</h2>
            <p>
              {isExpandedCourse ? (
                <>
                  В полном каталоге {plural(lessonCount, ['урок', 'урока', 'уроков'])}: базовая
                  хирагана и катакана, контролируемое чтение и первые письменные модели.
                </>
              ) : (
                <>
                  Сейчас в каталоге {plural(lessonCount, ['урок', 'урока', 'уроков'])}. Программа
                  развивается до {COURSE_MANIFEST.lessons}, но полный набор хираганы и катаканы
                  появится только с этим расширением.
                </>
              )}
            </p>
          </div>
          <div className="marketing-course-grid">
            <ol className="marketing-module-list">
              {modules.map((module, index) => (
                <li key={module.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <small lang="ja">{module.japaneseTitle}</small>
                    <h3>{module.title}</h3>
                    <p>{module.description}</p>
                  </div>
                  <em>{plural(module.lessonIds.length, ['урок', 'урока', 'уроков'])}</em>
                </li>
              ))}
            </ol>
            <aside className="marketing-outcomes">
              <span className="marketing-kicker">РЕЗУЛЬТАТ ТЕКУЩЕЙ ВЕРСИИ</span>
              <h3>
                {isExpandedCourse
                  ? 'Полная основа — в пределах этого контура.'
                  : 'Небольшой, но конкретный.'}
              </h3>
              <ul>
                {isExpandedCourse ? (
                  <>
                    <li>читать базовые хирагану и катакану в изученном диапазоне;</li>
                    <li>разбирать первые письменные модели и контролируемый словарь;</li>
                    <li>собрать короткое письменное представление о себе.</li>
                  </>
                ) : (
                  <>
                    <li>узнавать изученные знаки и первые слова;</li>
                    <li>
                      видеть тему <span lang="ja">は</span> и связку <span lang="ja">です</span>;
                    </li>
                    <li>собрать простое письменное представление о себе.</li>
                  </>
                )}
              </ul>
              <Link className="public-text-link" to="/plan">
                Изучить программу <ArrowUpRight size={16} />
              </Link>
            </aside>
          </div>
        </section>

        <section className="marketing-method" aria-labelledby="marketing-method-title">
          <div className="marketing-method-heading">
            <span className="marketing-kicker">МЕТОД ALTER</span>
            <h2 id="marketing-method-title">Пять ролей вокруг одного внимательного занятия.</h2>
            <p>
              ALTER — не алгоритм, который обещает результат. Это пять понятных опор для работы с
              текстом.
            </p>
          </div>
          <div className="marketing-alter-grid">
            {alterSteps.map(([letter, english, russian, description]) => (
              <article key={letter}>
                <span>{letter}</span>
                <div>
                  <small>{english}</small>
                  <h3>{russian}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          className="marketing-section marketing-pricing"
          aria-labelledby="marketing-pricing-title"
        >
          <div>
            <span className="marketing-kicker">ПРОЗРАЧНАЯ МОДЕЛЬ</span>
            <h2 id="marketing-pricing-title">За аккаунт и синхронизацию, не за доступ к знанию.</h2>
            <p>
              Открытые материалы можно читать и проверять в библиотеке. Облачный аккаунт добавляет
              хранение прогресса и синхронизацию между устройствами.
            </p>
          </div>
          <div className="marketing-price-card">
            <span className="marketing-price-label">ОБЛАЧНЫЙ АККАУНТ</span>
            <p className="marketing-price">
              <strong>$20</strong> / месяц
            </p>
            <ul>
              <li>
                <Check size={16} />7 дней без карты
              </li>
              <li>
                <Check size={16} />
                нет автосписания по окончании пробного периода
              </li>
              <li>
                <Check size={16} />
                открытые лицензированные материалы остаются читаемыми
              </li>
            </ul>
            <Link className="public-button" to="/membership">
              {billingDisabled ? 'Посмотреть план' : 'Выбрать аккаунт'} <ArrowRight size={17} />
            </Link>
            {billingDisabled ? (
              <p className="marketing-billing-notice">
                Биллинг отключён в текущей конфигурации: оформление плана не создаёт платёж, пока
                оператор не включит оплату.
              </p>
            ) : (
              <p className="marketing-price-note">
                Подписка оформляется только после вашего явного выбора способа оплаты.
              </p>
            )}
          </div>
        </section>

        {config?.environment === 'development' && (
          <section
            className="marketing-launch-status"
            aria-labelledby="marketing-launch-status-title"
          >
            <div>
              <span className="marketing-kicker">СРЕДА РАЗРАБОТКИ</span>
              <h2 id="marketing-launch-status-title">
                Аккаунты и синхронизация работают по-настоящему.
              </h2>
            </div>
            <div>
              <p>
                <strong>Как устроена разработка.</strong> Аккаунты, сессии и прогресс сохраняются в
                реальной базе данных. Письма попадают только в закрытый outbox разработки и не
                отправляются на внешние адреса.
              </p>
              {billingDisabled && (
                <p>
                  <strong>Оплата.</strong> Биллинг отключён этой конфигурацией; аккаунт и
                  синхронизация продолжают работать, а попытка оформить план не создаёт списание.
                </p>
              )}
              <p>
                <strong>Академическая проверка.</strong> Независимая предметная академическая
                рецензия материалов ещё не проведена. Это ограничение не скрывается и не заменяется
                обещанием сертификации.
              </p>
            </div>
          </section>
        )}

        {config?.environment === 'production' && (
          <section
            className="marketing-launch-status"
            aria-labelledby="marketing-launch-status-title"
          >
            <div>
              <span className="marketing-kicker">УСЛОВИЯ СЕРВИСА</span>
              <h2 id="marketing-launch-status-title">Учёба с аккаунтом — в обычном режиме.</h2>
            </div>
            <div>
              <p>
                <strong>Оператор и данные.</strong>{' '}
                {operator?.name ?? 'Сведения об операторе указаны в политике конфиденциальности.'}{' '}
                {operator?.email && (
                  <>
                    Связь: <a href={`mailto:${operator.email}`}>{operator.email}</a>.{' '}
                  </>
                )}
                Полные условия обработки данных — в{' '}
                <Link to="/legal/privacy">политике конфиденциальности</Link>.
              </p>
              {!billingDisabled && (
                <p>
                  <strong>Условия.</strong> Аккаунт, синхронизация и тариф работают по обычным
                  условиям сервиса; подробности — в <Link to="/legal/terms">условиях</Link>.
                </p>
              )}
              <p>
                <strong>Академическая проверка.</strong> Независимая предметная академическая
                рецензия материалов ещё не проведена. Мы называем это ограничение прямо и не выдаём
                программу за сертификационный стандарт.
              </p>
            </div>
          </section>
        )}

        <section className="marketing-section marketing-faq" aria-labelledby="marketing-faq-title">
          <div className="marketing-section-heading">
            <span className="marketing-kicker">ОТВЕТЫ ДО НАЧАЛА</span>
            <h2 id="marketing-faq-title">Без мелкого шрифта.</h2>
          </div>
          <div className="marketing-faq-list">
            <details open>
              <summary>Что входит в продукт?</summary>
              <p>
                Маршрут, уроки, письменные упражнения, карточки для повторения, библиотека
                источников и рабочие заметки. Никаких заявлений о сертификации или автоматической
                оценке владения языком.
              </p>
            </details>
            <details>
              <summary>Как устроены цена и пробный период?</summary>
              <p>
                Облачный аккаунт стоит $20 в месяц. Первые 7 дней не требуют карты, а после них
                ничего не списывается автоматически: оформление начинается только с вашего явного
                выбора.
              </p>
            </details>
            <details>
              <summary>Можно забрать свои данные?</summary>
              <p>
                Локальные данные остаются в вашем браузере. Для облачного аккаунта доступен
                переносимый экспорт прогресса, закладок и черновиков; если нужной кнопки нет, его
                можно запросить через <Link to="/help">помощь</Link>.
              </p>
            </details>
            <details>
              <summary>Кто проверял материалы?</summary>
              <p>
                Лицензии и источники видны в <Link to="/library">библиотеке</Link>. Оригинальные
                уроки подготовлены с помощью ИИ; независимая предметная рецензия преподавателем
                японского ещё не проведена. Мы не называем эту версию академически рецензированным
                курсом.
              </p>
            </details>
          </div>
        </section>
      </main>
      <footer className="marketing-footer">
        <span>
          University in a Box · <span lang="ja">日本語</span>
        </span>
        <nav aria-label="Служебная навигация">
          <Link to="/help">Помощь</Link>
          <Link to="/legal/privacy">Конфиденциальность</Link>
          <Link to="/legal/terms">Условия</Link>
        </nav>
      </footer>
    </div>
  );
}
