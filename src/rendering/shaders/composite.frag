#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uNear;
uniform sampler2D uFar;
uniform float uExposure;
void main() {
  vec3 raw = texture(uScene, vUV).rgb;
  vec3 closeGlow = texture(uNear, vUV).rgb;
  vec3 farGlow = texture(uFar, vUV).rgb;
  vec3 c = (raw + closeGlow*0.45 + farGlow*0.3) * uExposure;
  c = 1.0 - exp(-c * 0.92);
  c = pow(max(c, vec3(0.0)), vec3(0.454545));
  float vignette = 1.0 - 0.22 * dot(vUV-0.5, vUV-0.5);
  fragColor = vec4(c * vignette, 1.0);
}
