#version 300 es
precision highp float;

// Schwarzschild-radius units: horizon = 1, photon sphere = 1.5, ISCO = 3.
// A cinematic thin-disk rendering, with a Schwarzschild photon trajectory
// approximation and art-directed emission; not a Kerr/GR research simulation.
uniform vec2 uResolution;
uniform float uTime;
uniform float uInclination;
uniform float uRoll;
uniform float uZoom;
uniform float uBrightness;
out vec4 fragColor;

const float PI = 3.14159265359;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
            mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
            mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float turbulence(vec3 p) {
    float f = 0.56 * noise3(p);
    p = p * 2.03 + vec3(15.2, 7.8, 4.3);
    f += 0.28 * noise3(p);
    p = p * 2.01 + vec3(1.9, 8.3, 6.1);
    f += 0.14 * noise3(p);
    return f;
}

vec3 starfield(vec3 direction) {
    vec3 d = normalize(direction);
    vec2 spherical = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5,
                          asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
    vec3 result = vec3(0.0011, 0.0021, 0.0025);
    // Two populations remain fixed on the celestial sphere as the camera moves.
    for (int layer = 0; layer < 2; ++layer) {
        float scale = layer == 0 ? 610.0 : 1030.0;
        vec2 p = spherical * vec2(scale * 2.0, scale);
        vec2 cell = floor(p);
        vec2 local = fract(p);
        float seed = hash12(cell + float(layer) * 77.7);
        vec2 center = vec2(hash12(cell + 13.4), hash12(cell + 71.3));
        center = 0.2 + 0.6 * center;
        float radius = mix(0.075, 0.15, hash12(cell + 27.2));
        float point = exp(-dot(local - center, local - center) / (radius * radius));
        float presence = smoothstep(0.987, 0.998, seed);
        float brightness = mix(0.11, 0.63, pow(hash12(cell + 43.8), 6.0));
        vec3 color = mix(vec3(0.58, 0.73, 1.0), vec3(1.0, 0.83, 0.61), hash12(cell + 9.5));
        result += point * presence * brightness * color;
    }
    // Barely visible large-scale sky variation, never a competing nebula.
    result += vec3(0.0006, 0.0010, 0.0012) * noise3(d * 9.0 + 17.0);
    return result;
}

vec3 diskEmission(vec3 position, vec3 rayVelocity, float pixelFootprint) {
    float r = length(position.xz);
    float azimuth = atan(position.z, position.x);
    // Differential rotation advects the texture without changing the geometry.
    float orbitalPhase = azimuth - uTime * 0.34 * pow(3.0 / r, 1.5);
    vec2 orbit = vec2(cos(orbitalPhase), sin(orbitalPhase));
    float coarse = turbulence(vec3(orbit * 3.4, r * 0.85));
    float warpedRadius = r + 0.26 * (coarse - 0.5);
    // Long azimuthal wisps, with no periodic carrier to create woven moire.
    // The actual ray-intersection footprint filters compressed/lensed detail.
    float broad = noise3(vec3(orbit * 3.1, warpedRadius * 3.8));
    float fine = noise3(vec3(orbit * 6.7, warpedRadius * 12.0));
    broad = mix(0.5, broad, 1.0 - smoothstep(0.07, 0.32, pixelFootprint));
    fine = mix(0.5, fine, 1.0 - smoothstep(0.025, 0.12, pixelFootprint));
    float strands = 0.32 + 0.88 * broad + 0.30 * fine;
    float clumps = 0.42 + 1.12 * coarse;
    float innerEdge = smoothstep(3.0, 3.35, r);
    float raggedOuterEdge = 8.8 + 1.55 * coarse;
    float outerEdge = 1.0 - smoothstep(6.0, raggedOuterEdge, r);
    float wisps = mix(1.0, pow(0.3 + 1.15 * broad + 0.45 * coarse, 1.7),
                      smoothstep(5.0, 9.0, r));
    float luminosity = 7.7 * pow(3.4 / r, 2.35) * innerEdge * outerEdge;

    // Modest Doppler asymmetry is deliberate: both arcs stay visible, as in
    // the film reference. Relativistic frequency effects are visually compressed.
    vec3 orbitVelocity = normalize(vec3(-position.z, 0.0, position.x));
    float beta = sqrt(0.5 / max(r - 1.0, 1.0));
    float approach = dot(orbitVelocity, -normalize(rayVelocity));
    float doppler = sqrt(1.0 - beta * beta) / max(0.5, 1.0 - beta * approach);
    float beaming = clamp(pow(doppler, 1.35), 0.65, 1.7);
    float temperature = clamp((r - 3.3) / 6.5, 0.0, 1.0);
    vec3 color = mix(vec3(1.0, 0.83, 0.65), vec3(1.0, 0.43, 0.15), pow(temperature, 0.75));
    return color * luminosity * strands * clumps * wisps * beaming;
}

vec3 acceleration(vec3 p, float angularMomentumSquared) {
    float r2 = max(dot(p, p), 0.2);
    // Spatial null-geodesic form: d²r/dλ² = -(3/2) rs L² r / |r|⁵.
    return -1.5 * angularMomentumSquared * p / (r2 * r2 * sqrt(r2));
}

void main() {
    vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
    // Inverse camera roll: positive values make the disk rise to the right.
    float cr = cos(uRoll), sr = sin(uRoll);
    screen = mat2(cr, -sr, sr, cr) * screen;
    float elevation = clamp(uInclination, 0.02, 1.45);
    vec3 camera = 18.0 * vec3(0.0, sin(elevation), cos(elevation));
    vec3 forward = -normalize(camera);
    vec3 right = vec3(1.0, 0.0, 0.0);
    vec3 up = normalize(cross(right, forward));
    vec3 direction = normalize(forward * (3.2 * max(uZoom, 0.3))
                               + right * screen.x + up * screen.y);
    vec3 p = camera;
    vec3 velocity = direction;
    vec3 angularMomentum = cross(p, velocity);
    float h2 = dot(angularMomentum, angularMomentum);
    vec3 color = vec3(0.0);
    vec3 diskPosition = vec3(0.0);
    vec3 diskVelocity = direction;
    bool hitDisk = false;
    bool captured = false;
    bool escaped = false;
    vec3 a = acceleration(p, h2);

    // Adaptive velocity-Verlet preserves angular momentum well while keeping
    // the far-field cheap. Near-critical rays receive most of the work.
    for (int i = 0; i < 220; ++i) {
        float radius = length(p);
        if (radius < 1.015) { captured = true; break; }
        if (radius > 27.0 && dot(p, velocity) > 0.0) { escaped = true; break; }
        float stepSize = clamp(radius * 0.055, 0.032, 0.72);
        vec3 next = p + velocity * stepSize + 0.5 * a * stepSize * stepSize;
        vec3 nextAcceleration = acceleration(next, h2);
        vec3 nextVelocity = velocity + 0.5 * (a + nextAcceleration) * stepSize;

        if (p.y * next.y <= 0.0) {
            float fraction = clamp(p.y / (p.y - next.y), 0.0, 1.0);
            vec3 crossing = mix(p, next, fraction);
            float diskRadius = length(crossing.xz);
            if (diskRadius > 3.0 && diskRadius < 10.15) {
                diskPosition = crossing;
                diskVelocity = mix(velocity, nextVelocity, fraction);
                hitDisk = true;
                break;
            }
        }

        p = next;
        velocity = nextVelocity;
        a = nextAcceleration;
    }

    // Derivatives are evaluated after loop convergence, outside divergent
    // control flow. They capture the strong magnification near lensed arcs.
    float diskFootprint = max(length(dFdx(diskPosition).xz), length(dFdy(diskPosition).xz));
    if (hitDisk) {
        color = diskEmission(diskPosition, diskVelocity, diskFootprint);
    } else if (!captured) {
        // Unresolved critical rays stay dark; only escaped rays see the stars.
        if (escaped || length(p) > 16.0) color = starfield(velocity);
    }
    // A restrained subpixel critical-curve glint stabilizes the finest photon
    // ring at interactive resolution. Most of the visible ring is ray traced.
    float impact = sqrt(h2);
    float criticalImpact = 2.59657;
    float pixelFootprint = 18.0 * 2.0 / (uResolution.y * 3.2 * max(uZoom, 0.3));
    float ringWidth = max(0.009, pixelFootprint * 0.48);
    float criticalRing = exp(-pow((impact - criticalImpact) / ringWidth, 2.0));
    color += vec3(1.0, 0.76, 0.53) * criticalRing * 0.19;
    fragColor = vec4(color * max(uBrightness, 0.0), 1.0);
}
