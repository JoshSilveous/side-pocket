/**
 * SkSL fragment shader: procedural brick wall with normal-mapped neon lighting.
 *
 * Uniforms:
 *   iResolution  float2   canvas size in pixels
 *   brickScale   float    number of bricks across screen width (e.g. 8)
 *   mortarRatio  float    fraction of each brick cell that is mortar (e.g. 0.06)
 *   wallZ        float    z-depth offset for light direction calc (e.g. 200)
 *   bumpStrength float    normal map exaggeration (e.g. 60)
 *   numLights    int      how many lights are active (0–8)
 *   lightPos     float4[8] per light: (x, y, radius, intensity)
 *   lightColor   float4[8] per light: (r, g, b, unused)
 */
export const BRICK_LIGHTING_SHADER = `
uniform float2 iResolution;
uniform float  brickScale;
uniform float  mortarRatio;
uniform float  wallZ;
uniform float  bumpStrength;
uniform int    numLights;
uniform float4 lightPos[8];
uniform float4 lightColor[8];

// ── Brick height field ─────────────────────────────────────────────────────
// Returns 1.0 at brick face center, 0.0 deep in mortar groove.
float heightField(float2 pos, float brickW, float brickH, float mort) {
    float row    = floor(pos.y / brickH);
    float offset = mod(row, 2.0) * 0.5;
    float cx     = mod(pos.x / brickW + offset, 1.0);
    float cy     = mod(pos.y / brickH, 1.0);
    float mx     = smoothstep(0.0, mort, cx) * smoothstep(1.0, 1.0 - mort, cx);
    float my     = smoothstep(0.0, mort, cy) * smoothstep(1.0, 1.0 - mort, cy);
    return mx * my;
}

// ── Surface normal via finite differences ─────────────────────────────────
// In Skia screen space: X right, Y down, Z out toward viewer.
// cross(dx_tangent, dy_tangent) gives an outward-facing normal.
float3 calcNormal(float2 pos, float brickW, float brickH, float mort, float bump) {
    float eps = 1.5;
    float h0  = heightField(pos,                    brickW, brickH, mort);
    float hx  = heightField(pos + float2(eps, 0.0), brickW, brickH, mort);
    float hy  = heightField(pos + float2(0.0, eps), brickW, brickH, mort);
    float3 dx = float3(eps, 0.0, (hx - h0) * bump);
    float3 dy = float3(0.0, eps, (hy - h0) * bump);
    return normalize(cross(dx, dy));
}

// ── Entry point ───────────────────────────────────────────────────────────
half4 main(float2 fragCoord) {
    float brickW = iResolution.x / brickScale;
    float brickH = brickW * 0.4;

    float mask  = heightField(fragCoord, brickW, brickH, mortarRatio);
    float3 N    = calcNormal(fragCoord, brickW, brickH, mortarRatio, bumpStrength);

    // Roughness: mortar is rough/diffuse, brick face is semi-glossy
    float roughness = mix(0.95, 0.25, mask);

    // ── Procedural albedo ──────────────────────────────────────────────────
    float row     = floor(fragCoord.y / brickH);
    float offset  = mod(row, 2.0) * 0.5;
    float brickCol = floor(fragCoord.x / brickW + offset);

    // Per-brick colour variation via hash
    float hash    = fract(sin(row * 127.1 + brickCol * 311.7) * 43758.5);

    float3 brickBase  = float3(0.40, 0.18, 0.10);
    float3 mortarBase = float3(0.30, 0.27, 0.24);
    float3 brickVar   = brickBase * (0.86 + hash * 0.28);

    // Subtle surface grime on brick — darken corners using height
    float grime      = 1.0 - (1.0 - mask) * 0.18;
    float3 baseColor = mix(mortarBase, brickVar, mask) * grime;

    // ── Lighting ───────────────────────────────────────────────────────────
    // Very dark ambient — the bar is barely lit without neon
    float3 totalLight = float3(0.02, 0.015, 0.03);

    for (int i = 0; i < 8; i++) {
        if (i < numLights) {
            float2 lPos      = lightPos[i].xy;
            float  lRadius   = lightPos[i].z;
            float  lIntensity = lightPos[i].w;
            float3 lColor    = lightColor[i].rgb;

            float2 toLight = lPos - fragCoord;
            float  dist    = length(toLight);

            // Skip lights that don't reach this pixel
            if (dist < lRadius) {
                float atten = 1.0 - dist / lRadius;
                atten = atten * atten; // quadratic falloff

                // Light direction: neon floats in front of the wall at depth wallZ
                float3 L = normalize(float3(toLight, wallZ));

                // Diffuse (Lambert)
                float diffuse = max(0.0, dot(N, L));

                // Specular (Blinn-Phong)
                float3 V         = float3(0.0, 0.0, 1.0); // viewer straight ahead
                float3 H         = normalize(L + V);
                float  shininess = mix(96.0, 3.0, roughness);
                float  spec      = pow(max(0.0, dot(N, H)), shininess);

                totalLight += lColor * lIntensity * atten * (diffuse + spec * 0.4);
            }
        }
    }

    // Reinhard tone map to prevent blown-out highlights
    totalLight = totalLight / (totalLight + float3(1.0));

    float3 finalColor = baseColor * totalLight;
    return half4(half3(finalColor), 1.0);
}
`;
