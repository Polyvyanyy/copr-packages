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

export default function App() {
  return (
    <LearningProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="plan" element={<Plan />} />
          <Route path="lesson/:lessonId" element={<LessonPage />} />
          <Route path="practice" element={<Practice />} />
          <Route path="progress" element={<Progress />} />
          <Route path="library" element={<Library />} />
          <Route path="writing" element={<Writing />} />
          <Route path="connections" element={<Connections />} />
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
