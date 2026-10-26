import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { S, T, commit, emit } from './store';
import * as ink from './ink';
import * as ops from './ops';
import * as io from './io';
import * as grain from './grain';
import * as raster from './raster';
import * as brush from './brush';
import * as render from './render';
import * as model from './model';
import * as motion from './motion';
import * as clipfx from './clipfx';
import * as geometry from './geometry';
import { makeApi } from './api';

if (import.meta.env.DEV) (window as unknown as { __pm: unknown }).__pm = { S, T, commit, emit, ink, ops, io, grain, raster, brush, render, model, motion, clipfx, geometry };

(window as unknown as { promake: unknown }).promake = makeApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
