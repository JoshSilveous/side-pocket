export const MAX_EMITTERS = 48;

// ── SkSL shader ────────────────────────────────────────────────────────────
// Samples three textures (albedo, normal map, roughness map) and applies
// normal-mapped neon lighting from emitter point-lights.
//
// Coordinate convention:
//   fragCoord is in *canvas* pixels (the canvas may be rendered below screen
//   resolution for performance). `screenScale` converts canvas coords back to
//   screen pixels so lighting + tiling stay resolution-independent.
//   texScale (uniform) converts screen coords to texture-tiling coords.
//
// Normal map convention: standard OpenGL tangent-space.
//   R = +X (right), G = +Y (up in tangent space), B = +Z (surface normal).
//   Flat surface = RGB(128, 128, 255).
export function buildWallShader(specular: boolean): string {
    return `
uniform shader albedo;
uniform shader normalMap;
${specular ? "uniform shader roughnessMap;" : ""}
uniform float  screenScale; // canvas px -> screen px (1.0 when rendered full-res)
uniform float2 texScale;
uniform float2 imgSize;   // albedo pixel dimensions — used by mod() tiling
uniform float  wallZ;
uniform int    numEmitters;

uniform float4 emitters[${MAX_EMITTERS}];      // (x, y, reach, intensity), screen coords
uniform float4 emitterColors[${MAX_EMITTERS}]; // (r, g, b, _)

float3 applyLight(float4 light, float4 lColor, float2 fragCoord,
                  float3 N, float roughness, float wZ) {
    float2 toLight  = light.xy - fragCoord;
    float  dist     = length(toLight);
    float  radius   = light.z;
    float  intensity = light.w;
    if (dist >= radius || intensity <= 0.0) { return float3(0.0); }

    float atten    = 1.0 - dist / radius;
    atten          = atten * atten * atten * atten * atten * atten ;
    float3 L       = normalize(float3(toLight, wZ));
    float  diff    = max(0.0, dot(N, L));
${specular ? `    float3 V       = float3(0.0, 0.0, 1.0);
    float3 H       = normalize(L + V);
    float  shine   = mix(96.0, 3.0, roughness);
    float  spec    = pow(max(0.0, dot(N, H)), shine);

    return lColor.rgb * intensity * atten * (diff + spec * 0.4);` : `    return lColor.rgb * intensity * atten * diff;`}
}

half4 main(float2 fragCoord) {
    // Work in screen pixels regardless of the canvas render resolution.
    float2 sc = fragCoord * screenScale;
    float2 tc = mod(sc * texScale, imgSize);

    half4  albedoSample = albedo.eval(tc);
    half4  normalSample = normalMap.eval(tc);
    float  roughness    = ${specular ? "roughnessMap.eval(tc).r" : "0.0"};

    // Decode tangent-space normal: [0,1] -> [-1,1]
    float3 N = normalize(float3(normalSample.rg * 2.0 - 1.0, normalSample.b));

    // Near-black ambient — bricks almost invisible without neon (~2%)
    float3 totalLight = float3(0.02, 0.012, 0.015);

    for (int i = 0; i < ${MAX_EMITTERS}; i++) {
        if (i >= numEmitters) { break; }
        totalLight += applyLight(emitters[i], emitterColors[i], sc, N, roughness, wallZ);
    }

    // Reinhard tone map then apply to albedo
    totalLight = totalLight / (totalLight + float3(1.0));
    return half4(half3(albedoSample.rgb * totalLight), 1.0);
}
`;
}
