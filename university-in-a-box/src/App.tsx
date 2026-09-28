import { BookOpen } from 'lucide-react';
import { Link, Route, Routes } from 'react-router';
import { Shell } from './components/Shell';
import { EmptyState } from './components/ui';
import { LearningProvider } from './learning-context';
import { Home } from './pages/Home';
import { Plan } from './pages/Plan';
import { LessonPage } from './pages/Lesson';
import { Practice } from './pages/Practice';
import { Progress } from './pages/Progress';
import { Library } from './pages/Library';
import { Writing } from './pages/Writing';
import { Connections } from './pages/Connections';
import { ProductProvider, useProduct } from './product-context';
import { Account } from './pages/Account';
import { AuthPage } from './pages/Auth';
import { Help } from './pages/Help';
import { Kana } from './pages/Kana';
import { Legal } from './pages/Legal';
import { Membership } from './pages/Membership';
import { Onboarding } from './pages/Onboarding';
import { Welcome } from './pages/Welcome';

export default function App() {
  return (
    <ProductProvider>
      <ProductRoutes />
    </ProductProvider>
  );
}

function ProductRoutes() {
  const { account } = useProduct();
  return (
    <LearningProvider key={account?.user.id ?? 'guest'} accountId={account?.user.id}>
      <Routes>
        <Route path="welcome" element={<Welcome />} />
        <Route path="auth/sign-in" element={<AuthPage key="sign-in" mode="sign-in" />} />
        <Route path="auth/sign-up" element={<AuthPage key="sign-up" mode="sign-up" />} />
        <Route
          path="auth/forgot-password"
          element={<AuthPage key="forgot-password" mode="forgot-password" />}
        />
        <Route
          path="auth/reset-password"
          element={<AuthPage key="reset-password" mode="reset-password" />}
        />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="plan" element={<Plan />} />
          <Route path="lesson/:lessonId" element={<LessonPage />} />
          <Route path="practice" element={<Practice />} />
          <Route path="progress" element={<Progress />} />
          <Route path="library" element={<Library />} />
          <Route path="writing" element={<Writing />} />
          <Route path="connections" element={<Connections />} />
          <Route path="kana" element={<Kana />} />
          <Route path="account" element={<Account />} />
          <Route path="membership" element={<Membership />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="help" element={<Help />} />
          <Route path="legal/privacy" element={<Legal page="privacy" />} />
          <Route path="legal/terms" element={<Legal page="terms" />} />
          <Route
            path="*"
            element={
              <EmptyState
                mark={<BookOpen size={32} />}
                title="Этот путь ещё не проложен"
                description="Вернёмся туда, где начинается ваше обучение."
                action={
                  <Link to="/" className="button primary">
                    В мой кампус
                  </Link>
                }
              />
            }
          />
        </Route>
      </Routes>
    </LearningProvider>
  );
}
