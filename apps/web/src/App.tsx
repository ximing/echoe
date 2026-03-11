import { BrowserRouter, HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router';
import { useEffect } from 'react';
import AuthPage from './pages/auth';
import HomePage from './pages/cards';
import StudyPage from './pages/cards/study';
import CardEditorPage from './pages/cards/card-editor';
import CardBrowserPage from './pages/cards/browser';
import StatsPage from './pages/cards/stats';
import CardsSettingsPage from './pages/cards/settings';
import NoteTypesPage from './pages/cards/notetypes';
import TagsPage from './pages/cards/tags';
import MediaPage from './pages/cards/media';
import CsvImportPage from './pages/cards/csv-import';
import DuplicatesPage from './pages/cards/duplicates';
import LandingPage from './pages/landing';
import SettingsPage from './pages/settings';
import { AccountSettings } from './pages/settings/components/account-settings';
import { ModelSettings } from './pages/settings/components/model-settings';
import { ThemeSettings } from './pages/settings/components/theme-settings';
import { About } from './pages/settings/components/about';
import NotFoundPage from './pages/not-found';
import { ProtectedRoute } from './components/protected-route';
import { ToastContainer } from './components/toast';
import { setNavigate } from './utils/navigation';
import { isElectron } from './electron/isElectron';

// 内部组件，用于根据环境渲染根路由
function RootRoute() {
  if (isElectron()) {
    return <Navigate to="/cards" replace />;
  }
  return <LandingPage />;
}

// 内部组件，用于初始化 navigate 函数
function AppContent() {
  const navigate = useNavigate();

  useEffect(() => {
    // 在组件挂载时设置 navigate 函数
    setNavigate(navigate);
  }, [navigate]);

  return null;
}

function App() {
  const Router = isElectron() ? HashRouter : BrowserRouter;

  return (
    <Router>
      <AppContent />
      <ToastContainer />
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/cards"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/browser"
          element={
            <ProtectedRoute>
              <CardBrowserPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/stats"
          element={
            <ProtectedRoute>
              <StatsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/study/:deckId?"
          element={
            <ProtectedRoute>
              <StudyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/cards/new"
          element={
            <ProtectedRoute>
              <CardEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/cards/:noteId/edit"
          element={
            <ProtectedRoute>
              <CardEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/cards/:cardId/edit-card"
          element={
            <ProtectedRoute>
              <CardEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/deck/:deckId/edit"
          element={
            <ProtectedRoute>
              <CardEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/notetypes"
          element={
            <ProtectedRoute>
              <NoteTypesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/tags"
          element={
            <ProtectedRoute>
              <TagsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/media"
          element={
            <ProtectedRoute>
              <MediaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/import/csv"
          element={
            <ProtectedRoute>
              <CsvImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/duplicates"
          element={
            <ProtectedRoute>
              <DuplicatesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/settings"
          element={
            <ProtectedRoute>
              <CardsSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/settings/account" replace />} />
          <Route path="account" element={<AccountSettings />} />
          <Route path="models" element={<ModelSettings />} />
          <Route path="theme" element={<ThemeSettings />} />
          <Route path="about" element={<About />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}

export default App;
