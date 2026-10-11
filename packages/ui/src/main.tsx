import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import './app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root missing');
createRoot(root).render(<App />);
