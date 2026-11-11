import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Demo } from './Demo.js';

const host = document.getElementById('root');
if (!host) throw new Error('Missing field demo root');
createRoot(host).render(<StrictMode><Demo /></StrictMode>);
