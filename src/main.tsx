import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import './reader.css';
import './layout.css';
import { installTextContextMenu } from './desktop-interactions';

const removeTextContextMenu = installTextContextMenu();
if (import.meta.hot) import.meta.hot.dispose(removeTextContextMenu);
createRoot(document.getElementById('root')!).render(<App />);
