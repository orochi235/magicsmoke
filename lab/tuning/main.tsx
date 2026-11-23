/// <reference types="vite/client" />
import '@weasel-js/labkit/styles.css';
import { IconRegistryProvider } from '@weasel-js/icons/react';
import { Persistence } from '@weasel-js/labkit';
import { kitIcons } from '@weasel-js/ui-canvas/kit-icons';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('tuning lab: the page has no #root');

createRoot(host).render(
  <IconRegistryProvider icons={kitIcons}>
    <Persistence storageKey="magicsmoke-tuning-lab">
      <App />
    </Persistence>
  </IconRegistryProvider>,
);
