import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

console.log('=== FRONTEND: main.tsx loading ===');
console.log('=== FRONTEND: React version:', React.version);
console.log('=== FRONTEND: Document ready state:', document.readyState);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('=== FRONTEND: React app rendered ===');