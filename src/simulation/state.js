/** Public simulator options. Camera roll is stored in radians. */
export const PARAMETERS = Object.freeze({
  angle: Object.freeze({ label: 'Viewing angle', min: 1, max: 80, step: 1, default: 4 }),
  roll: Object.freeze({ label: 'Camera roll', min: -Math.PI, max: Math.PI, step: Math.PI / 180, default: 0.28 }),
  glow: Object.freeze({ label: 'Disk glow', min: 0.25, max: 2.2, step: 0.05, default: 1 }),
  zoom: Object.freeze({ label: 'Zoom', min: 0.65, max: 1.5, step: 0.01, default: 1 }),
  speed: Object.freeze({ label: 'Orbital speed', min: 0, max: 3, step: 0.1, default: 1 }),
});

export const QUALITY_MODES = Object.freeze(['auto', 'performance', 'balanced', 'cinematic']);

export const DEFAULT_STATE = Object.freeze({
  angle: 4,
  roll: 0.28,
  glow: 1,
  zoom: 1,
  speed: 1,
  quality: 'auto',
  paused: false,
});

export const PRESETS = Object.freeze({
  gargantua: Object.freeze({ label: 'Gargantua', angle: 4, roll: 0.28, glow: 1, zoom: 1, speed: 1 }),
  'edge-on': Object.freeze({ label: 'Edge-on', angle: 2, roll: 0.18, glow: 1.15, zoom: 1.05, speed: 1 }),
  'photon-ring': Object.freeze({ label: 'Photon ring', angle: 15, roll: 0.28, glow: 1.4, zoom: 1.35, speed: 0.7 }),
  'top-view': Object.freeze({ label: 'Top view', angle: 68, roll: 0, glow: 0.9, zoom: 0.85, speed: 1.2 }),
});

/** Validate first and return a fresh state so an invalid patch never partially applies. */
export function updateState(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Options must be an object.');
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_STATE, key)) throw new TypeError(`Unknown option: ${key}`);
    if (key === 'paused') {
      if (typeof value !== 'boolean') throw new TypeError('paused must be a boolean.');
      next.paused = value;
      continue;
    }
    if (key === 'quality') {
      if (!QUALITY_MODES.includes(value)) throw new TypeError(`Unknown quality mode: ${value}`);
      next.quality = value;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${key} must be a finite number.`);
    const { min, max } = PARAMETERS[key];
    next[key] = Math.max(min, Math.min(max, value));
  }
  return next;
}

export function formatParameter(key, value, accessible = false) {
  if (key === 'angle') return `${Math.round(value)}${accessible ? ' degrees' : '°'}`;
  if (key === 'roll') return `${Math.round(value * 180 / Math.PI)}${accessible ? ' degrees' : '°'}`;
  if (key === 'glow') return `${Math.round(value * 100)}${accessible ? ' percent' : '%'}`;
  if (key === 'zoom') return `${value.toFixed(2)}${accessible ? ' times' : '×'}`;
  if (key === 'speed') return `${value.toFixed(1)}${accessible ? ' times' : '×'}`;
  throw new TypeError(`Unknown parameter: ${key}`);
}

export function advanceTime(time, elapsedSeconds, state) {
  return state.paused ? time : time + Math.max(0, Math.min(elapsedSeconds, 0.08)) * state.speed;
}
