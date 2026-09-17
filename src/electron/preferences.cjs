'use strict';

const QUALITY = new Set(['auto', 'performance', 'balanced', 'cinematic']);
const PRESETS = new Set(['gargantua', 'edge-on', 'photon-ring', 'top-view', 'custom']);
const NUMBER_RULES = Object.freeze({
  angle: [1, 80],
  roll: [-Math.PI, Math.PI],
  glow: [0.25, 2.2],
  zoom: [0.65, 1.5],
  speed: [0, 3],
});

function finiteNumber(value, [minimum, maximum], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function sanitizePreferences(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const state = value.state && typeof value.state === 'object' && !Array.isArray(value.state) ? value.state : {};
  const cleanState = {};
  for (const [key, rule] of Object.entries(NUMBER_RULES)) {
    if (key in state) cleanState[key] = finiteNumber(state[key], rule, undefined);
  }
  if (typeof state.paused === 'boolean') cleanState.paused = state.paused;
  if (QUALITY.has(state.quality)) cleanState.quality = state.quality;
  return {
    version: 1,
    state: Object.fromEntries(Object.entries(cleanState).filter(([, item]) => item !== undefined)),
    preset: PRESETS.has(value.preset) ? value.preset : 'gargantua',
    tipsDismissed: value.tipsDismissed === true,
  };
}

function sanitizeWindowState(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const key of ['x', 'y']) {
    if (Number.isInteger(value[key]) && Math.abs(value[key]) < 100000) result[key] = value[key];
  }
  if (Number.isInteger(value.width) && value.width >= 820 && value.width < 100000) result.width = value.width;
  if (Number.isInteger(value.height) && value.height >= 640 && value.height < 100000) result.height = value.height;
  if (typeof value.maximized === 'boolean') result.maximized = value.maximized;
  return result;
}

module.exports = { sanitizePreferences, sanitizeWindowState };
