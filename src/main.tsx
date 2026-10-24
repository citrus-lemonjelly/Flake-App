import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { emptyData } from './model/factory';
import { StoreProvider } from './state/store';
import { SyncProvider } from './state/sync';
import { defaultStorage } from './store/storage';
import { Store } from './store/store';
import { SyncManager } from './sync/SyncManager';
import './styles.css';

const store = await Store.open(defaultStorage(), emptyData);
const sync = new SyncManager(store);
void sync.start();

// Offline support for the installed app. Production only, so dev reloads stay fresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* offline support is a bonus; the app works without it */
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <SyncProvider manager={sync}>
        <App />
      </SyncProvider>
    </StoreProvider>
  </StrictMode>,
);
