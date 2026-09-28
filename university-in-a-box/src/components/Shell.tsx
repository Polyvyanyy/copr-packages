import { useEffect, useState } from 'react';
import {
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Leaf,
  Menu,
  Network,
  NotebookPen,
  Search,
  ShieldCheck,
  Sun,
  PenLine,
  Monitor,
  Cloud,
  CreditCard,
  LifeBuoy,
  TableProperties,
  UserRound,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { lessons } from '../domain/curriculum';
import { getCourseStats } from '../domain/progress';
import { useLearning } from '../learning-context';
import { Dialog, ProgressBar } from './ui';
import { SearchDialog } from './SearchDialog';
import { MountainMark } from './Artwork';
import { useProduct } from '../product-context';
import { SyncBanner } from './SyncBanner';

const navigation = [
  { to: '/', label: 'Сегодня', icon: Sun },
  { to: '/plan', label: 'Учебный план', icon: Compass },
  { to: '/practice', label: 'Практика', icon: PenLine },
  { to: '/progress', label: 'Мой прогресс', icon: ChartNoAxesCombined },
];
const workspace = [
  { to: '/kana', label: 'Таблица каны', icon: TableProperties },
  { to: '/library', label: 'Библиотека', icon: BookOpen },
  { to: '/writing', label: 'Мои работы', icon: NotebookPen },
  { to: '/connections', label: 'Новые связи', icon: Network },
];
const serviceLinks = [
  { to: '/account', label: 'Аккаунт', icon: UserRound },
  { to: '/membership', label: 'Подписка', icon: CreditCard },
  { to: '/help', label: 'Помощь', icon: LifeBuoy },
];

export function Shell() {
  const { state, notice, syncStatus, cloudReady } = useLearning();
  const { account, config, status } = useProduct();
  const [searchOpen, setSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const stats = getCourseStats(state, lessons);
  const current =
    [...navigation, ...workspace, ...serviceLinks].find((item) => item.to === location.pathname)
      ?.label ??
    {
      '/onboarding': 'Ваш план',
      '/legal/privacy': 'Конфиденциальность',
      '/legal/terms': 'Условия',
    }[location.pathname] ??
    'Занятие';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.title = `${current} · Японский — University in a Box`;
    const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname, location.hash, current]);

  const menu = (
    <>
      <Link
        to="/"
        className="brand"
        onClick={() => setMobileOpen(false)}
        aria-label="University in a Box — на главную"
      >
        <span className="brand-mark" lang="ja">
          学
        </span>
        <span>
          University<span>in a Box</span>
        </span>
      </Link>
      <div className="language-label">
        <span className="japan-flag" />
        <strong>Японский</strong>
        <span lang="ja">日本語</span>
      </div>
      <div className="nav-section-label">ОБУЧЕНИЕ</div>
      <nav aria-label="Обучение">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            end
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={19} strokeWidth={1.65} />
            <span>{label}</span>
            {to === '/practice' && state.savedCardIds.length > 0 && (
              <span className="nav-count">{state.savedCardIds.length}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="nav-section-label tools-label">ВАШЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Учебные инструменты">
        {workspace.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={19} strokeWidth={1.65} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <nav className="service-navigation" aria-label="Аккаунт и помощь">
        {serviceLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.65} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <MountainMark />
          <span className="eyebrow">МАЛЕНЬКИЕ ШАГИ, КАЖДЫЙ ДЕНЬ</span>
          <strong>У каждого свой путь.</strong>
          <p>Начните там, где вы сейчас.</p>
          <ProgressBar value={stats.percentage} label="Пройденные занятия" />
          <div className="sidebar-progress-label">
            {stats.completed} из {stats.total} занятий пройдено
          </div>
        </div>
        <button
          className="sidebar-help"
          onClick={() => {
            setAboutOpen(true);
            setMobileOpen(false);
          }}
        >
          <CircleHelp size={17} />О вашем кампусе
          <ChevronRight size={15} />
        </button>
        <div className="sidebar-copyright">Создано для вдумчивого обучения.</div>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <aside className="sidebar">{menu}</aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть навигацию"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={23} />
            </button>
            <span className="desktop-crumb">Мой кампус</span>
            <ChevronRight className="desktop-crumb" size={14} />
            <span>{current}</span>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Открыть поиск"
            >
              <Search size={17} />
              <span>Найти в кампусе</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <div
              className="local-save"
              title={
                account
                  ? 'Состояние серверного сохранения'
                  : 'Гостевые данные хранятся только в этом браузере'
              }
            >
              {account ? <Cloud size={16} /> : <Monitor size={16} />}
              <span>
                {account
                  ? syncStatus === 'synced'
                    ? 'Сохранено в аккаунте'
                    : syncStatus === 'saving'
                      ? 'Сохраняем…'
                      : syncStatus === 'loading'
                        ? 'Загружаем…'
                        : 'Не синхронизировано'
                  : 'На этом устройстве'}
              </span>
            </div>
            <Link
              className="profile-avatar"
              to={account ? '/account' : '/auth/sign-in'}
              aria-label={account ? 'Мой аккаунт' : 'Войти в аккаунт'}
            >
              {account ? account.user.name.slice(0, 1).toUpperCase() : <UserRound size={19} />}
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <SyncBanner />
          {!account && location.pathname === '/' && (
            <div className="guest-banner">
              <div>
                <strong>Ваш первый шаг — без регистрации.</strong>
                <p>
                  Для сохранения между устройствами создайте аккаунт. Гостевые записи перенесёте
                  сами, когда будете готовы.
                </p>
              </div>
              <Link className="button secondary" to="/auth/sign-up">
                Начать 7 дней бесплатно
                <ChevronRight size={16} />
              </Link>
            </div>
          )}
          {account?.subscription.access === 'free' && (
            <div className="guest-banner">
              <div>
                <strong>Аккаунт доступен для чтения и экспорта.</strong>
                <p>Для новых серверных сохранений продлите доступ. Ваши записи не удалены.</p>
              </div>
              <Link className="button secondary" to="/membership">
                Условия подписки
              </Link>
            </div>
          )}
          {status === 'unavailable' && (
            <p className="environment-note">
              Сервис аккаунтов сейчас недоступен. Локальная практика не является серверным
              сохранением.
            </p>
          )}
          {(!account || cloudReady) && <Outlet />}
        </main>
        <footer className="page-footer">
          <span>
            University in a Box<span className="footer-dot">·</span>日本語
          </span>
          <span>
            <Link to="/welcome">О курсе</Link>
            <Link to="/legal/privacy">Данные</Link>
            <Link to="/legal/terms">Условия</Link>
            <Leaf size={13} />
            Не быстрее. Глубже.
          </span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
      {mobileOpen && (
        <Dialog
          open
          onClose={() => setMobileOpen(false)}
          title="Ваш кампус"
          className="mobile-nav-dialog"
        >
          <div className="mobile-navigation">{menu}</div>
        </Dialog>
      )}
      <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} title="Ваш японский кампус">
        <div className="about-heading">
          <span className="brand-mark" lang="ja">
            学
          </span>
          <div>
            <h3>Учиться осмысленно</h3>
            <p>Одна программа. Внимание к каждому шагу.</p>
          </div>
        </div>
        <div className="about-price">
          <div>
            <span className="eyebrow">ПЛАН ПОДПИСКИ</span>
            <strong>Японский</strong>
          </div>
          <div>
            <b>$20</b>
            <span> / месяц</span>
          </div>
        </div>
        <div className="soft-note">
          <ShieldCheck size={21} />
          <div>
            <strong>
              {account
                ? 'Личный аккаунт с серверным сохранением'
                : 'Открытая практика и личный аккаунт'}
            </strong>
            <p>
              Гостевые записи остаются в браузере. Аккаунт позволяет сохранять прогресс между
              устройствами. 7 дней бесплатно, без карты. Вся практика работает без запросов к ИИ.
            </p>
          </div>
        </div>
        <h4>Прозрачность важнее обещаний</h4>
        <p className="muted">
          Внешняя академическая рецензия программы ещё не проведена. Проверки заданий не являются
          сертификацией языкового уровня.{' '}
          {config?.billing.enabled
            ? 'Управление оплатой доступно на странице подписки.'
            : 'Приём платежей в этой среде не настроен.'}
        </p>
        <Link
          className="button secondary about-account-link"
          to={account ? '/account' : '/auth/sign-up'}
          onClick={() => setAboutOpen(false)}
        >
          {account ? 'Открыть аккаунт' : 'Создать аккаунт'}
          <ChevronRight size={16} />
        </Link>
        <Link className="text-link" to="/library" onClick={() => setAboutOpen(false)}>
          Источники и условия использования
          <ChevronRight size={16} />
        </Link>
      </Dialog>
    </div>
  );
}
