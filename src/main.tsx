import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { browserStorage, hasSeenRules, hydrateStore, markRulesSeen } from './state/persistence';
import { getGameStore } from './state/store';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Load settings and stats synchronously so the first render already has the saved theme.
const storage = browserStorage();
const store = getGameStore();
hydrateStore(store, storage);

// Rules open on the first visit only; the flag is set as soon as they are shown.
const firstVisit = !hasSeenRules(storage);
if (firstVisit) markRulesSeen(storage);

createRoot(root).render(
  <StrictMode>
    <App store={store} storage={storage} showRulesOnLoad={firstVisit} />
  </StrictMode>,
);
