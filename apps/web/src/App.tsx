import { BrowserRouter, HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router';
import { useEffect } from 'react';
import AuthPage from './pages/auth';
import HomePage from './pages/cards';
import StudyPage from './pages/cards/study';
import CardEditorPage from './pages/cards/card-editor';
import CardBrowserPage from './pages/cards/browser';
import StatsPage from './pages/cards/stats';
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
import { LearningSettings } from './pages/settings/components/learning-settings';
import { DisplaySettings } from './pages/settings/components/display-settings';
import { AudioSettings } from './pages/settings/components/audio-settings';
import { DataSettings } from './pages/settings/components/data-settings';
import { PresetSettings } from './pages/settings/components/preset-settings';
import NotFoundPage from './pages/not-found';
import { ProtectedRoute } from './components/protected-route';
import { Layout } from './components/layout';
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
              <Layout>
                <HomePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/browser"
          element={
            <ProtectedRoute>
              <Layout>
                <CardBrowserPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/stats"
          element={
            <ProtectedRoute>
              <Layout>
                <StatsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/study/:deckId?"
          element={
            <ProtectedRoute>
              <Layout>
                <StudyPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/cards/new"
          element={
            <ProtectedRoute>
              <Layout>
                <CardEditorPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/cards/:noteId/edit"
          element={
            <ProtectedRoute>
              <Layout>
                <CardEditorPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/cards/:cardId/edit-card"
          element={
            <ProtectedRoute>
              <Layout>
                <CardEditorPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/deck/:deckId/edit"
          element={
            <ProtectedRoute>
              <Layout>
                <CardEditorPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/notetypes"
          element={
            <ProtectedRoute>
              <Layout>
                <NoteTypesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/tags"
          element={
            <ProtectedRoute>
              <Layout>
                <TagsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/media"
          element={
            <ProtectedRoute>
              <Layout>
                <MediaPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/import/csv"
          element={
            <ProtectedRoute>
              <Layout>
                <CsvImportPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cards/duplicates"
          element={
            <ProtectedRoute>
              <Layout>
                <DuplicatesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <SettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/settings/account" replace />} />
          <Route path="account" element={<AccountSettings />} />
          <Route path="models" element={<ModelSettings />} />
          <Route path="theme" element={<ThemeSettings />} />
          <Route path="about" element={<About />} />
          {/* Card Management - rendered in Settings right panel */}
          <Route path="import" element={<CsvImportPage />} />
          <Route path="duplicates" element={<DuplicatesPage />} />
          <Route path="learning" element={<LearningSettings />} />
          <Route path="display" element={<DisplaySettings />} />
          <Route path="audio" element={<AudioSettings />} />
          <Route path="data" element={<DataSettings />} />
          <Route path="presets" element={<PresetSettings />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}

export default App;
