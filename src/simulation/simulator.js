import { DEFAULT_STATE, updateState, advanceTime } from './state.js';
import { createQualityController } from './quality-controller.js';
import { createWebGLRenderer } from '../rendering/webgl-renderer.js';
import { createFallbackRenderer } from '../rendering/fallback-renderer.js';

/** Mount an independent simulator in a sized container. */
export function createSimulator(container, options = {}) {
  if (!container || container.nodeType !== 1) throw new TypeError('A container element is required.');
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let state = updateState({ ...DEFAULT_STATE, paused: motion.matches }, options);
  const quality = createQualityController(state.quality);
  let canvas, renderer, disposed = false, dirty = true, visible = true;
  let status = '', time = 35, lastTime = 0, lastDraw = 0, frame = 0, pointer = null;
  const subscriptions = new Set();
  const events = new win.AbortController();
  const eventOptions = { signal: events.signal };

  function snapshot() {
    return { state: { ...state }, renderer: renderer.kind, effectiveQuality: quality.effectiveName, status };
  }
  function notify() {
    const value = snapshot();
    for (const listener of subscriptions) {
      try { listener(value); } catch (error) { console.error('Simulator subscriber failed:', error); }
    }
  }
  function setOptions(patch) {
    if (disposed) throw new Error('This simulator has been disposed.');
    const next = updateState(state, patch);
    if (next.quality !== state.quality) quality.setMode(next.quality);
    state = next;
    dirty = true;
    resize();
    notify();
  }

  function createCanvas() {
    const element = doc.createElement('canvas');
    element.className = 'black-hole-canvas';
    element.tabIndex = 0;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', 'Black hole with a glowing accretion disk and gravitationally lensed arcs.');
    if (container.dataset.describedBy) element.setAttribute('aria-describedby', container.dataset.describedBy);
    element.textContent = 'A bright disk wraps around the dark shadow of a black hole.';
    return element;
  }

  function initializeRenderer(forceFallback = false) {
    renderer?.dispose();
    const oldCanvas = canvas;
    canvas = createCanvas();
    if (oldCanvas) oldCanvas.replaceWith(canvas); else container.append(canvas);
    status = '';
    try {
      if (forceFallback) throw new Error('Graphics context lost');
      renderer = createWebGLRenderer(canvas);
    } catch {
      const replacement = createCanvas();
      canvas.replaceWith(replacement);
      canvas = replacement;
      renderer = createFallbackRenderer(canvas);
      status = forceFallback
        ? 'The graphics renderer restarted in Simplified mode.'
        : 'Hardware acceleration is unavailable. Using Simplified mode; all controls still work.';
    }
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (disposed) return;
      initializeRenderer(true);
      resize();
      notify();
    }, eventOptions);
    dirty = true;
  }

  function resize() {
    if (disposed || !renderer) return;
    const rect = container.getBoundingClientRect();
    const profile = quality.profile;
    const ratio = Math.min(win.devicePixelRatio || 1, 1.5, profile.maxWidth / Math.max(1, rect.width)) * profile.scale;
    try {
      renderer.resize(Math.max(2, Math.round(rect.width * ratio)), Math.max(2, Math.round(rect.height * ratio)));
    } catch (error) {
      if (renderer.kind !== 'webgl') throw error;
      initializeRenderer(true);
      resize();
      notify();
    }
    dirty = true;
  }

  initializeRenderer();
  const resizeObserver = new win.ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new win.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    lastTime = 0;
    dirty = true;
  });
  intersectionObserver.observe(container);
  resize();

  motion.addEventListener('change', event => { if (event.matches) setOptions({ paused: true }); }, eventOptions);
  doc.addEventListener('visibilitychange', () => { lastTime = 0; dirty = true; }, eventOptions);

  container.addEventListener('pointerdown', event => {
    if (event.target !== canvas || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, angle: state.angle, roll: state.roll };
    canvas.setPointerCapture(event.pointerId);
  }, eventOptions);
  container.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    setOptions({ angle: pointer.angle + (event.clientY - pointer.y) * 0.18, roll: pointer.roll + (event.clientX - pointer.x) * 0.003 });
  }, eventOptions);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) container.addEventListener(type, () => { pointer = null; }, eventOptions);
  container.addEventListener('wheel', event => {
    if (event.target !== canvas) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
    setOptions({ zoom: state.zoom - pixels * 0.0005 });
  }, { ...eventOptions, passive: false });
  container.addEventListener('keydown', event => {
    if (event.target !== canvas || event.ctrlKey || event.metaKey || event.altKey) return;
    const multiplier = event.shiftKey ? 5 : 1;
    const actions = {
      ArrowUp: { angle: state.angle - multiplier },
      ArrowDown: { angle: state.angle + multiplier },
      ArrowLeft: { roll: state.roll - multiplier * Math.PI / 180 },
      ArrowRight: { roll: state.roll + multiplier * Math.PI / 180 },
      '+': { zoom: state.zoom + multiplier * 0.02 },
      '=': { zoom: state.zoom + multiplier * 0.02 },
      '-': { zoom: state.zoom - multiplier * 0.02 },
      _: { zoom: state.zoom - multiplier * 0.02 },
    };
    if (!actions[event.key]) return;
    event.preventDefault();
    setOptions(actions[event.key]);
  }, eventOptions);

  function animate(now) {
    if (disposed) return;
    if (!container.isConnected) { dispose(); return; }
    const elapsed = lastTime ? (now - lastTime) / 1000 : 0;
    lastTime = now;
    if (visible && !doc.hidden) {
      time = advanceTime(time, elapsed, state);
      const drawGap = lastDraw ? now - lastDraw : Infinity;
      if (dirty || (!state.paused && state.speed > 0 && drawGap >= quality.profile.frameInterval)) {
        if (!dirty && quality.recordFrame(drawGap)) {
          resize();
          notify();
        }
        renderer.draw({ ...state, time });
        dirty = false;
        lastDraw = now;
      }
    }
    frame = win.requestAnimationFrame(animate);
  }
  frame = win.requestAnimationFrame(animate);

  async function capturePng() {
    if (disposed) throw new Error('This simulator has been disposed.');
    renderer.draw({ ...state, time });
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not capture the scene.')), 'image/png'));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    win.cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    events.abort();
    renderer.dispose();
    subscriptions.clear();
    canvas.remove();
  }

  return Object.freeze({
    setOptions,
    getState: () => ({ ...state }),
    capturePng,
    subscribe(listener) {
      if (disposed) throw new Error('This simulator has been disposed.');
      if (typeof listener !== 'function') throw new TypeError('A listener function is required.');
      subscriptions.add(listener);
      listener(snapshot());
      return () => subscriptions.delete(listener);
    },
    dispose,
    get canvas() { return canvas; },
  });
}
