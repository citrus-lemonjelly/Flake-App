import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { emptyData } from './model/factory';
import { StoreProvider } from './state/store';
import { defaultStorage } from './store/storage';
import { Store } from './store/store';
import './styles.css';

const store = await Store.open(defaultStorage(), emptyData);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
