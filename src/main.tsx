import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AnalysisProvider } from './state/analysisStore';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('SoftView: #root element is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <AnalysisProvider>
      <App />
    </AnalysisProvider>
  </StrictMode>,
);
