#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uStep;
uniform float uThreshold;
vec3 readColor(vec2 uv) {
  vec3 c = texture(uTexture, uv).rgb;
  float bright = max(max(c.r, c.g), c.b);
  return c * max(bright - uThreshold, 0.0) / max(bright, 0.00001);
}
void main() {
  vec3 c = readColor(vUV) * 0.227027;
  c += readColor(vUV + 1.384615*uStep) * 0.316216;
  c += readColor(vUV - 1.384615*uStep) * 0.316216;
  c += readColor(vUV + 3.230769*uStep) * 0.070270;
  c += readColor(vUV - 3.230769*uStep) * 0.070270;
  fragColor = vec4(c, 1.0);
}
