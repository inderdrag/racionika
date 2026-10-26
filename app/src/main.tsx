import { Capacitor } from '@capacitor/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import './tokens.css';
import './style.css';
import { App } from './App';
if (Capacitor.isNativePlatform()) document.documentElement.dataset.native = 'true';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
