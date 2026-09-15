/// <reference types="vite/client" />
import '@weasel-js/labkit/styles.css';
import { Persistence } from '@weasel-js/labkit';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('tuning lab: the page has no #root');

createRoot(host).render(
  <Persistence storageKey="magicsmoke-tuning-lab">
    <App />
  </Persistence>,
);
