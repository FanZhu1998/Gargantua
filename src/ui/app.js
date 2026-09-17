import { createSimulator } from '../simulation/simulator.js';
import { DEFAULT_STATE, PARAMETERS, PRESETS, QUALITY_MODES, formatParameter, updateState } from '../simulation/state.js';

let instanceCount = 0;
const CONTROL_GROUPS = Object.freeze({ camera: ['angle', 'roll', 'zoom'], disk: ['glow', 'speed'] });

function timestampName(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `gargantua-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.png`;
}

function matchesPreset(state, preset) {
  return ['angle', 'roll', 'glow', 'zoom', 'speed'].every(key => Math.abs(state[key] - preset[key]) < 0.0001);
}

/** Mount the complete GUI around the reusable simulation core. */
export function mountBlackHoleApp(container, { preferences = {}, platformApi } = {}) {
  if (!platformApi) throw new TypeError('A platform API is required.');
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const id = `gargantua-${++instanceCount}`;
  let savedState;
  try { savedState = updateState({ ...DEFAULT_STATE }, preferences.state || {}); }
  catch { savedState = { ...DEFAULT_STATE }; }
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) savedState.paused = true;
  let tipsDismissed = preferences.tipsDismissed === true;
  let activePreset = Object.hasOwn(PRESETS, preferences.preset) ? preferences.preset : 'custom';
  let fullscreen = false, disposed = false, saveTimer = 0, lastRendererMessage = '';
  const events = new win.AbortController();
  const eventOptions = { signal: events.signal };

  const root = doc.createElement('div');
  root.className = 'black-hole-app';
  root.innerHTML = `
    <header class="app-bar">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><div><p>BLACK HOLE EXPLORER</p><h1>Gargantua<span>.</span></h1></div></div>
      <div class="toolbar" aria-label="Application actions">
        <span class="renderer-badge" data-renderer-status>Starting renderer…</span>
        <button type="button" class="button button-quiet" data-action="help" aria-keyshortcuts="?">Shortcuts</button>
        <button type="button" class="button button-quiet" data-action="copy">Copy image</button>
        <button type="button" class="button" data-action="save" aria-keyshortcuts="S">Save PNG</button>
        <button type="button" class="button" data-action="fullscreen" aria-keyshortcuts="F">Fullscreen</button>
      </div>
    </header>
    <main class="workspace">
      <section class="viewer" aria-label="Interactive black hole view">
        <div class="scene-frame">
          <div class="scene" data-described-by="${id}-instructions"></div>
          <span class="paused-indicator" data-paused-indicator hidden>Paused</span>
          <div class="scene-actions">
            <button type="button" class="round-action" data-action="pause" aria-pressed="false" aria-keyshortcuts="Space">Pause</button>
          </div>
        </div>
        <p class="scene-instructions" id="${id}-instructions">Drag to orbit · Scroll or use +/− to zoom · Focus the scene and use arrow keys for precise movement</p>
      </section>
      <aside class="inspector" aria-label="Simulation settings">
        <section class="control-section preset-section" aria-labelledby="${id}-preset-title">
          <div class="section-heading"><h2 id="${id}-preset-title">Views</h2><span>1–4</span></div>
          <div class="preset-grid" data-presets></div>
        </section>
        <fieldset class="control-section" data-group="camera"><legend>Camera</legend><div class="control-list"></div><button type="button" class="text-action" data-action="reset-view" aria-keyshortcuts="R">Reset view</button></fieldset>
        <fieldset class="control-section" data-group="disk"><legend>Accretion disk</legend><div class="control-list"></div></fieldset>
        <fieldset class="control-section rendering-controls"><legend>Rendering</legend>
          <label class="select-control" for="${id}-quality"><span>Quality</span><select id="${id}-quality" data-control="quality"></select></label>
          <p class="field-hint">Auto adjusts detail to keep motion smooth.</p>
        </fieldset>
        <button type="button" class="button button-wide button-quiet" data-action="reset-all">Restore all defaults</button>
      </aside>
    </main>
    <footer class="status-bar"><p class="live-status" role="status" aria-live="polite"></p><p><span data-version>Gargantua</span> · Offline</p></footer>
    <dialog class="dialog" data-dialog="welcome" aria-labelledby="${id}-welcome-title">
      <form method="dialog"><p class="dialog-eyebrow">WELCOME ABOARD</p><h2 id="${id}-welcome-title">Explore Gargantua</h2>
        <ul class="tip-list"><li><kbd>Drag</kbd><span>Orbit around the accretion disk</span></li><li><kbd>Scroll</kbd><span>Move closer or farther away</span></li><li><kbd>Space</kbd><span>Pause or resume the disk</span></li></ul>
        <label class="checkbox"><input type="checkbox" data-hide-tips> Don’t show this again</label>
        <button type="submit" class="button button-primary" value="start">Start exploring</button></form>
    </dialog>
    <dialog class="dialog shortcuts-dialog" data-dialog="shortcuts" aria-labelledby="${id}-shortcuts-title">
      <form method="dialog"><div class="dialog-header"><div><p class="dialog-eyebrow">KEYBOARD</p><h2 id="${id}-shortcuts-title">Shortcuts</h2></div><button type="submit" class="button button-quiet" aria-label="Close shortcuts">Close</button></div>
        <dl class="shortcut-list"><div><dt><kbd>Space</kbd></dt><dd>Pause or resume</dd></div><div><dt><kbd>R</kbd></dt><dd>Reset view</dd></div><div><dt><kbd>F</kbd></dt><dd>Fullscreen</dd></div><div><dt><kbd>S</kbd></dt><dd>Save PNG</dd></div><div><dt><kbd>1–4</kbd></dt><dd>Choose a view</dd></div><div><dt><kbd>Arrow keys</kbd></dt><dd>Orbit focused scene</dd></div><div><dt><kbd>+ / −</kbd></dt><dd>Zoom focused scene</dd></div></dl>
      </form>
    </dialog>`;
  container.append(root);

  const scene = root.querySelector('.scene');
  const controls = {};
  const outputs = {};
  const presets = root.querySelector('[data-presets]');
  const status = root.querySelector('.live-status');
  const pause = root.querySelector('[data-action="pause"]');
  const rendererBadge = root.querySelector('[data-renderer-status]');
  const pausedIndicator = root.querySelector('[data-paused-indicator]');
  const quality = root.querySelector('[data-control="quality"]');
  const welcome = root.querySelector('[data-dialog="welcome"]');
  const shortcuts = root.querySelector('[data-dialog="shortcuts"]');

  for (const [key, preset] of Object.entries(PRESETS)) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'preset-button';
    button.dataset.preset = key;
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="preset-orbit" aria-hidden="true"></span><span>${preset.label}</span>`;
    presets.append(button);
  }
  for (const [group, keys] of Object.entries(CONTROL_GROUPS)) {
    const list = root.querySelector(`[data-group="${group}"] .control-list`);
    for (const key of keys) {
      const definition = PARAMETERS[key];
      const label = doc.createElement('label');
      label.className = 'range-control';
      label.htmlFor = `${id}-${key}`;
      label.innerHTML = `<span class="control-label"><span>${definition.label}</span><output for="${id}-${key}"></output></span>`;
      const input = doc.createElement('input');
      Object.assign(input, { type: 'range', id: `${id}-${key}`, name: key, min: definition.min, max: definition.max, step: definition.step });
      input.dataset.control = key;
      label.append(input);
      list.append(label);
      controls[key] = input;
      outputs[key] = label.querySelector('output');
    }
  }
  for (const mode of QUALITY_MODES) {
    const option = doc.createElement('option');
    option.value = mode;
    option.textContent = mode === 'auto' ? 'Auto (recommended)' : mode[0].toUpperCase() + mode.slice(1);
    quality.append(option);
  }

  const simulator = createSimulator(scene, savedState);
  function announce(message) { status.textContent = ''; win.requestAnimationFrame(() => { status.textContent = message; }); }
  function inferredPreset(state) {
    return Object.entries(PRESETS).find(([, preset]) => matchesPreset(state, preset))?.[0] || 'custom';
  }
  function queuePreferenceSave() {
    clearTimeout(saveTimer);
    saveTimer = win.setTimeout(() => {
      platformApi.savePreferences({ version: 1, state: simulator.getState(), preset: activePreset, tipsDismissed }).catch(() => announce('Settings could not be saved.'));
    }, 250);
  }
  const unsubscribe = simulator.subscribe(snapshot => {
    const { state } = snapshot;
    activePreset = inferredPreset(state);
    for (const key of Object.keys(controls)) {
      controls[key].value = state[key];
      controls[key].setAttribute('aria-valuetext', formatParameter(key, state[key], true));
      outputs[key].value = formatParameter(key, state[key]);
    }
    quality.value = state.quality;
    pause.textContent = state.paused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-pressed', String(state.paused));
    pausedIndicator.hidden = !state.paused;
    root.dataset.paused = String(state.paused);
    root.dataset.renderer = snapshot.renderer;
    root.dataset.quality = snapshot.effectiveQuality;
    rendererBadge.textContent = snapshot.renderer === 'webgl'
      ? `WebGL 2 · ${snapshot.state.quality === 'auto' ? `Auto / ${snapshot.effectiveQuality}` : snapshot.effectiveQuality}`
      : 'Simplified renderer';
    for (const button of presets.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.preset === activePreset));
    if (snapshot.status && snapshot.status !== lastRendererMessage) { lastRendererMessage = snapshot.status; announce(snapshot.status); }
    queuePreferenceSave();
  });

  function applyPreset(key) {
    const preset = PRESETS[key];
    const { label, ...values } = preset;
    const current = simulator.getState();
    simulator.setOptions({ ...values, paused: current.paused, quality: current.quality });
    activePreset = key;
    announce(`${label} view selected.`);
  }
  function resetView() {
    simulator.setOptions({ angle: DEFAULT_STATE.angle, roll: DEFAULT_STATE.roll, zoom: DEFAULT_STATE.zoom });
    announce('Camera reset to the Gargantua view.');
  }
  function resetAll() {
    const paused = simulator.getState().paused;
    simulator.setOptions({ ...DEFAULT_STATE, paused });
    activePreset = 'gargantua';
    announce('Settings restored to Gargantua defaults.');
  }
  async function imageBuffer() { return (await simulator.capturePng()).arrayBuffer(); }
  async function saveImage() {
    const button = root.querySelector('[data-action="save"]');
    button.disabled = true;
    try {
      const name = timestampName();
      const result = await platformApi.savePng(await imageBuffer(), name);
      announce(result?.canceled ? 'Save canceled.' : `Screenshot saved as ${result?.fileName || name}.`);
    } catch (error) { announce(error?.message || 'The screenshot could not be saved.'); }
    finally { button.disabled = false; }
  }
  async function copyImage() {
    const button = root.querySelector('[data-action="copy"]');
    button.disabled = true;
    try { await platformApi.copyPng(await imageBuffer()); announce('Black hole image copied to the clipboard.'); }
    catch (error) { announce(error?.message || 'The image could not be copied.'); }
    finally { button.disabled = false; }
  }
  async function toggleFullscreen() {
    try { await platformApi.toggleFullscreen(); }
    catch { announce('Fullscreen is unavailable in this window.'); }
  }

  for (const [key, input] of Object.entries(controls)) input.addEventListener('input', () => simulator.setOptions({ [key]: Number(input.value) }), eventOptions);
  quality.addEventListener('change', () => { simulator.setOptions({ quality: quality.value }); announce(`${quality.selectedOptions[0].textContent} quality selected.`); }, eventOptions);
  presets.addEventListener('click', event => { const button = event.target.closest('[data-preset]'); if (button) applyPreset(button.dataset.preset); }, eventOptions);
  pause.addEventListener('click', () => simulator.setOptions({ paused: !simulator.getState().paused }), eventOptions);
  root.querySelector('[data-action="save"]').addEventListener('click', saveImage, eventOptions);
  root.querySelector('[data-action="copy"]').addEventListener('click', copyImage, eventOptions);
  root.querySelector('[data-action="fullscreen"]').addEventListener('click', toggleFullscreen, eventOptions);
  root.querySelector('[data-action="help"]').addEventListener('click', () => shortcuts.showModal(), eventOptions);
  root.querySelector('[data-action="reset-view"]').addEventListener('click', resetView, eventOptions);
  root.querySelector('[data-action="reset-all"]').addEventListener('click', resetAll, eventOptions);
  welcome.addEventListener('close', () => { if (welcome.querySelector('[data-hide-tips]').checked) tipsDismissed = true; queuePreferenceSave(); simulator.canvas.focus(); }, eventOptions);

  const stopFullscreenListener = platformApi.onFullscreenChanged(value => {
    fullscreen = value;
    root.querySelector('[data-action="fullscreen"]').textContent = fullscreen ? 'Exit fullscreen' : 'Fullscreen';
  });
  win.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (['input', 'select', 'textarea', 'button'].includes(tag) || event.target?.isContentEditable || root.querySelector('dialog[open]')) return;
    const presetKeys = { '1': 'gargantua', '2': 'edge-on', '3': 'photon-ring', '4': 'top-view' };
    if (presetKeys[event.key]) { event.preventDefault(); applyPreset(presetKeys[event.key]); return; }
    const actions = {
      ' ': () => simulator.setOptions({ paused: !simulator.getState().paused }),
      r: resetView,
      R: resetView,
      f: toggleFullscreen,
      F: toggleFullscreen,
      s: saveImage,
      S: saveImage,
      '?': () => shortcuts.showModal(),
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  }, eventOptions);

  platformApi.getAppInfo().then(info => { root.querySelector('[data-version]').textContent = `${info.name} ${info.version}`; }).catch(() => {});
  if (!tipsDismissed) win.requestAnimationFrame(() => { if (!disposed) welcome.showModal(); });
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches && !lastRendererMessage) announce('Motion is paused because reduced motion is enabled on this computer.');

  return Object.freeze({
    simulator,
    element: root,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(saveTimer);
      unsubscribe();
      stopFullscreenListener?.();
      events.abort();
      simulator.dispose();
      root.remove();
    },
  });
}
