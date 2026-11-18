import '@cs/shared/tokens.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import './styles/base.css';
import './styles/components.css';
import { langFromCode } from '@cs/shared/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { launch, signalReady } from './telegram';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing');

const { initData, languageCode } = launch();

createRoot(container).render(
  <StrictMode>
    <App initData={initData} fallbackLang={langFromCode(languageCode)} />
  </StrictMode>,
);

// After the first frame, so Telegram's placeholder is replaced by content, not by a blank page.
requestAnimationFrame(signalReady);
