import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MobileApp from './mobile/MobileApp';
import { ErrorBoundary } from './ErrorBoundary';
import { I18nProvider } from './i18n';

const RootApp = /Android/i.test(navigator.userAgent) || new URLSearchParams(location.search).has('mobile-preview') ? MobileApp : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <RootApp />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
