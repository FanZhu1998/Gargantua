import { createPlatformApi } from './platform-api.js';
import { mountBlackHoleApp } from './ui/app.js';

const container = document.getElementById('app');
const platformApi = createPlatformApi();

async function initialize() {
  try {
    const preferences = await platformApi.loadPreferences();
    const app = mountBlackHoleApp(container, { preferences, platformApi });
    window.__GARGANTUA_READY__ = true;
    window.addEventListener('pagehide', event => { if (!event.persisted) app.dispose(); }, { once: true });
  } catch (error) {
    console.error('Could not initialize Gargantua:', error);
    const message = document.createElement('section');
    message.className = 'fatal-error';
    message.setAttribute('role', 'alert');
    message.innerHTML = '<h1>Gargantua could not start</h1><p>Restart the app. If the problem continues, update your graphics driver.</p>';
    container.replaceChildren(message);
  }
}

initialize();
