import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/AppErrorBoundary.tsx';
import './index.css';
import './styles/learner-components.css';
import './styles/admin-design-system.css';
import { registerApplicationServiceWorker } from '@/lib/serviceWorker';

function applyStoredTheme() {
  let preference: string | null = null;
  try { preference = window.localStorage.getItem('bfs-theme'); } catch { /* Storage can be unavailable in private browsing. */ }
  const useDark = preference === 'dark' || (preference === 'system' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  if (useDark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = useDark ? 'dark' : 'light';
}

applyStoredTheme();

void registerApplicationServiceWorker().catch((error) => {
  console.warn("[service-worker] registration unavailable", {
    name: error?.name || "Error"
  });
});
const systemThemeMedia = window.matchMedia?.('(prefers-color-scheme: dark)');
systemThemeMedia?.addEventListener?.('change', () => {
  try { if (window.localStorage.getItem('bfs-theme') === 'system') applyStoredTheme(); } catch { /* Keep the active theme if storage is unavailable. */ }
});


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>
);
