export const QUALITY_PROFILES = Object.freeze({
  performance: Object.freeze({ label: 'Performance', scale: 0.55, maxWidth: 900, frameInterval: 48 }),
  balanced: Object.freeze({ label: 'Balanced', scale: 0.8, maxWidth: 1280, frameInterval: 32 }),
  cinematic: Object.freeze({ label: 'Cinematic', scale: 1.15, maxWidth: 1800, frameInterval: 32 }),
});

const AUTO_LEVELS = ['performance', 'balanced', 'cinematic'];

export function createQualityController(initialMode = 'auto') {
  let mode = initialMode;
  let autoIndex = 1;
  let slowFrames = 0;
  let smoothFrames = 0;

  function effectiveName() { return mode === 'auto' ? AUTO_LEVELS[autoIndex] : mode; }
  function setMode(value) {
    if (value !== 'auto' && !Object.hasOwn(QUALITY_PROFILES, value)) throw new TypeError(`Unknown quality mode: ${value}`);
    mode = value;
    slowFrames = 0;
    smoothFrames = 0;
  }
  function recordFrame(milliseconds) {
    if (mode !== 'auto' || !Number.isFinite(milliseconds) || milliseconds <= 0) return false;
    if (milliseconds > 72) {
      slowFrames++;
      smoothFrames = 0;
    } else if (milliseconds < 48) {
      smoothFrames++;
      slowFrames = Math.max(0, slowFrames - 1);
    } else {
      slowFrames = Math.max(0, slowFrames - 1);
      smoothFrames = Math.max(0, smoothFrames - 1);
    }
    if (slowFrames >= 10 && autoIndex > 0) {
      autoIndex--;
      slowFrames = 0;
      smoothFrames = 0;
      return true;
    }
    if (smoothFrames >= 300 && autoIndex < AUTO_LEVELS.length - 1) {
      autoIndex++;
      slowFrames = 0;
      smoothFrames = 0;
      return true;
    }
    return false;
  }
  return Object.freeze({
    setMode,
    recordFrame,
    get mode() { return mode; },
    get effectiveName() { return effectiveName(); },
    get profile() { return QUALITY_PROFILES[effectiveName()]; },
  });
}
