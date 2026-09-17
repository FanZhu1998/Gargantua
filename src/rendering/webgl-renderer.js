import vertex from './shaders/fullscreen.vert';
import sceneFragment from './shaders/black-hole.frag';
import blurFragment from './shaders/bloom.frag';
import compositeFragment from './shaders/composite.frag';

export function createWebGLRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL 2 unavailable');
  const hasHDR = !!gl.getExtension('EXT_color_buffer_float');
  const programs = [], targets = [];
  let width = 0, height = 0;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message);
    }
    return shader;
  }
  function program(source) {
    const p = gl.createProgram();
    let vs, fs;
    try {
      vs = compile(gl.VERTEX_SHADER, vertex);
      fs = compile(gl.FRAGMENT_SHADER, source);
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    } catch (error) {
      gl.deleteProgram(p);
      throw error;
    } finally {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }
    programs.push(p);
    const locs = new Map();
    return { p, loc(name) { if (!locs.has(name)) locs.set(name, gl.getUniformLocation(p, name)); return locs.get(name); } };
  }
  let scene, blur, composite;
  try {
    scene = program(sceneFragment); blur = program(blurFragment); composite = program(compositeFragment);
  } catch (error) {
    programs.forEach(p => gl.deleteProgram(p));
    throw error;
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  function deleteTargets() {
    for (const target of targets) { gl.deleteFramebuffer(target.fbo); gl.deleteTexture(target.texture); }
    targets.length = 0;
  }
  function target(w, h) {
    const texture = gl.createTexture(), fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, hasHDR ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hasHDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo); gl.deleteTexture(texture);
      throw new Error('Framebuffer unavailable');
    }
    const value = { texture, fbo, w, h }; targets.push(value); return value;
  }
  function bindTexture(p, name, texture, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(p.loc(name), unit);
  }
  function destination(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : width, t ? t.h : height);
  }
  function blurPass(source, dest, x, y, threshold) {
    gl.useProgram(blur.p); destination(dest);
    bindTexture(blur, 'uTexture', source.texture, 0);
    gl.uniform2f(blur.loc('uStep'), x/source.w, y/source.h);
    gl.uniform1f(blur.loc('uThreshold'), threshold); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return {
    kind: 'webgl',
    resize(w, h) {
      if (w === width && h === height) return;
      width = w; height = h; canvas.width = w; canvas.height = h; deleteTargets();
      target(w, h);
      target(Math.max(1, Math.round(w/4)), Math.max(1, Math.round(h/4)));
      target(Math.max(1, Math.round(w/4)), Math.max(1, Math.round(h/4)));
      target(Math.max(1, Math.round(w/14)), Math.max(1, Math.round(h/14)));
      target(Math.max(1, Math.round(w/14)), Math.max(1, Math.round(h/14)));
    },
    draw(state) {
      gl.useProgram(scene.p); destination(targets[0]);
      gl.uniform2f(scene.loc('uResolution'), width, height);
      gl.uniform1f(scene.loc('uTime'), state.time);
      gl.uniform1f(scene.loc('uInclination'), state.angle * Math.PI/180);
      gl.uniform1f(scene.loc('uRoll'), state.roll);
      gl.uniform1f(scene.loc('uZoom'), state.zoom);
      gl.uniform1f(scene.loc('uBrightness'), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      blurPass(targets[0], targets[1], 1, 0, hasHDR ? 0.7 : 0.3);
      blurPass(targets[1], targets[2], 0, 1.5, 0);
      blurPass(targets[2], targets[1], 1.5, 0, 0);
      blurPass(targets[1], targets[3], 1, 0, 0);
      blurPass(targets[3], targets[4], 1.0, 0, 0);
      blurPass(targets[4], targets[3], 0, 1.0, 0);
      blurPass(targets[3], targets[4], 1.0, 0, 0);
      blurPass(targets[4], targets[3], 0, 1.0, 0);
      gl.useProgram(composite.p); destination(null);
      bindTexture(composite, 'uScene', targets[0].texture, 0);
      bindTexture(composite, 'uNear', targets[1].texture, 1);
      bindTexture(composite, 'uFar', targets[3].texture, 2);
      gl.uniform1f(composite.loc('uExposure'), state.glow);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      deleteTargets();
      programs.forEach(p => gl.deleteProgram(p));
      gl.deleteVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  };
}
