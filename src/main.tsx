import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

// Hanken Grotesk : la police de la charte du cabinet, celle du portail et de
// TNS Pilot. Auto-hébergée, jamais via Google Fonts — un CDN de polices voit
// l'adresse IP de chaque visiteur, ce qui n'a pas lieu d'être sur un produit
// qui héberge des données clients, et cela obligerait à rouvrir
// fonts.googleapis.com et fonts.gstatic.com dans la CSP.
// Vite intègre les fichiers au bundle et les sert en même origine.
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
