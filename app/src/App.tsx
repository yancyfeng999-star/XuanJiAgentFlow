import { HashRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { lazy, Suspense } from 'react';

const Home = lazy(() => import('./pages/Home'));
const InputPage = lazy(() => import('./pages/Input'));
const CanvasPage = lazy(() => import('./pages/Canvas'));
const Plan = lazy(() => import('./pages/Plan'));
const EditPage = lazy(() => import('./pages/Edit'));
const RunPage = lazy(() => import('./pages/Run'));
const ResultPage = lazy(() => import('./pages/Result'));

function Loading() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>加载中...</div>;
}

export default function App() {
  return (
    <HashRouter>
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/input" element={<InputPage />} />
              <Route path="/canvas" element={<CanvasPage />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/edit" element={<EditPage />} />
              <Route path="/run" element={<RunPage />} />
              <Route path="/result" element={<ResultPage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </HashRouter>
  );
}
