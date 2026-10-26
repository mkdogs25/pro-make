import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { S, T, commit, emit } from './store';
import * as ink from './ink';
import * as ops from './ops';
import * as io from './io';
import * as grain from './grain';

if (import.meta.env.DEV) (window as unknown as { __pm: unknown }).__pm = { S, T, commit, emit, ink, ops, io, grain };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
