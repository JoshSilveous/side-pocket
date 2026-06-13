import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  useImage,
  type DataSourceParam,
} from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import type { LightSource } from "./types";

// ── SkSL shader ────────────────────────────────────────────────────────────
// Samples three textures (albedo, normal map, roughness map) and applies
// normal-mapped neon lighting.
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
const TEXTURE_SHADER = `
uniform shader albedo;
uniform shader normalMap;
uniform shader roughnessMap;
uniform float  screenScale; // canvas px -> screen px (1.0 when rendered full-res)
uniform float2 texScale;
uniform float2 imgSize;   // albedo pixel dimensions — used by mod() tiling
uniform float  wallZ;
uniform int    numLights;

uniform float4 l0; uniform float4 lc0;
uniform float4 l1; uniform float4 lc1;
uniform float4 l2; uniform float4 lc2;
uniform float4 l3; uniform float4 lc3;
uniform float4 l4; uniform float4 lc4;
uniform float4 l5; uniform float4 lc5;
uniform float4 l6; uniform float4 lc6;
uniform float4 l7; uniform float4 lc7;

float3 applyLight(float4 light, float4 lColor, float2 fragCoord,
                  float3 N, float roughness, float wZ) {
    float2 toLight  = light.xy - fragCoord;
    float  dist     = length(toLight);
    float  radius   = light.z;
    float  intensity = light.w;
    if (dist >= radius) { return float3(0.0); }

    float atten    = 1.0 - dist / radius;
    atten          = atten * atten;
    float3 L       = normalize(float3(toLight, wZ));
    float  diff    = max(0.0, dot(N, L));
    float3 V       = float3(0.0, 0.0, 1.0);
    float3 H       = normalize(L + V);
    float  shine   = mix(96.0, 3.0, roughness);
    float  spec    = pow(max(0.0, dot(N, H)), shine);

    return lColor.rgb * intensity * atten * (diff + spec * 0.4);
}

half4 main(float2 fragCoord) {
    // Work in screen pixels regardless of the canvas render resolution.
    float2 sc = fragCoord * screenScale;
    float2 tc = mod(sc * texScale, imgSize);

    half4  albedoSample = albedo.eval(tc);
    half4  normalSample = normalMap.eval(tc);
    float  roughness    = roughnessMap.eval(tc).r;

    // Decode tangent-space normal: [0,1] -> [-1,1]
    float3 N = normalize(float3(normalSample.rg * 2.0 - 1.0, normalSample.b));

    // Near-black ambient — bricks almost invisible without neon (~2%)
    float3 totalLight = float3(0.02, 0.012, 0.015);

    if (numLights > 0) { totalLight += applyLight(l0, lc0, sc, N, roughness, wallZ); }
    if (numLights > 1) { totalLight += applyLight(l1, lc1, sc, N, roughness, wallZ); }
    if (numLights > 2) { totalLight += applyLight(l2, lc2, sc, N, roughness, wallZ); }
    if (numLights > 3) { totalLight += applyLight(l3, lc3, sc, N, roughness, wallZ); }
    if (numLights > 4) { totalLight += applyLight(l4, lc4, sc, N, roughness, wallZ); }
    if (numLights > 5) { totalLight += applyLight(l5, lc5, sc, N, roughness, wallZ); }
    if (numLights > 6) { totalLight += applyLight(l6, lc6, sc, N, roughness, wallZ); }
    if (numLights > 7) { totalLight += applyLight(l7, lc7, sc, N, roughness, wallZ); }

    // Reinhard tone map then apply to albedo
    totalLight = totalLight / (totalLight + float3(1.0));
    return half4(half3(albedoSample.rgb * totalLight), 1.0);
}
`;

const MAX_LIGHTS = 8;

/**
 * Internal render resolution for the brick wall, as a fraction of screen size.
 * The wall is a dim, low-frequency background, so rendering below native
 * resolution and upscaling is imperceptible but cuts fragment-shader work
 * (~1 / RES²). Set to 1 to disable.
 */
const BRICK_RENDER_SCALE = 0.75;

let textureEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
try {
  textureEffect = Skia.RuntimeEffect.Make(TEXTURE_SHADER);
  if (!textureEffect) {
    console.warn("[BrickBackground] Shader returned falsy — likely unsupported on this platform.");
  }
} catch (e) {
  console.error("[BrickBackground] SkSL compile error:", e);
}

// ── Types ──────────────────────────────────────────────────────────────────

export type WallTextures = {
  /** Colour/albedo texture. e.g. require('@/assets/textures/brick_albedo.png') */
  albedo: DataSourceParam;
  /** OpenGL tangent-space normal map. Flat = RGB(128,128,255). */
  normalMap: DataSourceParam;
  /** Greyscale roughness map. White = fully rough/diffuse. */
  roughnessMap: DataSourceParam;
};

type Props = {
  lightsShared: SharedValue<LightSource[]>;
  intensityShared: SharedValue<Record<string, number>>;
  width: number;
  height: number;
  textures?: WallTextures;
  /**
   * How many tiles of the brick texture appear across the screen width.
   * Tune this to match the physical scale of your texture artwork. Default: 4
   */
  tileCount?: number;
  /**
   * Z-depth of the neon light relative to the wall surface (pixels).
   * Higher = shallower lighting angle. Default: 220
   */
  wallZ?: number;
};

// ── Component ──────────────────────────────────────────────────────────────

export function BrickBackground({
  lightsShared,
  intensityShared,
  width,
  height,
  textures,
  tileCount = 4,
  wallZ = 220,
}: Props) {
  const albedoImg    = useImage(textures?.albedo    ?? null);
  const normalImg    = useImage(textures?.normalMap  ?? null);
  const roughnessImg = useImage(textures?.roughnessMap ?? null);

  // Reduced-resolution canvas, upscaled to fill via a top-left transform.
  // Kept as floats (no rounding) so width*RES * (1/RES) lands exactly on `width`
  // — avoids a sub-pixel uncovered sliver at the right/bottom edge.
  const canvasW = Math.max(1, width * BRICK_RENDER_SCALE);
  const canvasH = Math.max(1, height * BRICK_RENDER_SCALE);

  // Isotropic texture scale — both axes share this so the texture keeps its
  // natural aspect ratio. Computed in *screen* space (independent of render res).
  const imgW = albedoImg ? albedoImg.width() : 1;
  const imgH = albedoImg ? albedoImg.height() : 1;
  const scaleX = (tileCount * imgW) / width;

  // Reactive uniforms: assembled on the UI thread from the shared light buffers.
  // Brightness flicker / slider drags update intensityShared on the UI thread, so
  // the brick redraws without any React reconciliation.
  const uniforms = useDerivedValue(() => {
    "worklet";
    const lights = lightsShared.value;
    const intens = intensityShared.value;
    const n = lights.length < MAX_LIGHTS ? lights.length : MAX_LIGHTS;

    const lp: number[][] = [];
    const lc: number[][] = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = i < n ? lights[i] : null;
      if (l) {
        lp.push([l.x, l.y, l.radius, intens[l.id] ?? l.intensity]);
        lc.push([l.r, l.g, l.b, 0]);
      } else {
        lp.push([0, 0, 0, 0]);
        lc.push([0, 0, 0, 0]);
      }
    }

    return {
      screenScale: 1 / BRICK_RENDER_SCALE,
      texScale: [scaleX, scaleX],
      imgSize: [imgW, imgH],
      wallZ,
      numLights: n,
      l0: lp[0], lc0: lc[0],
      l1: lp[1], lc1: lc[1],
      l2: lp[2], lc2: lc[2],
      l3: lp[3], lc3: lc[3],
      l4: lp[4], lc4: lc[4],
      l5: lp[5], lc5: lc[5],
      l6: lp[6], lc6: lc[6],
      l7: lp[7], lc7: lc[7],
    };
  }, [scaleX, imgW, imgH, wallZ]);

  // Wait until all three textures are loaded and shader compiled
  if (!textureEffect || !albedoImg || !normalImg || !roughnessImg) {
    return null; // NeonRenderer's black background shows through
  }

  return (
    <Canvas
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasW,
        height: canvasH,
        transformOrigin: "0% 0%",
        transform: [{ scale: 1 / BRICK_RENDER_SCALE }],
      }}
      pointerEvents="none"
    >
      <Fill>
        <Shader source={textureEffect} uniforms={uniforms}>
          {/* Order must match SkSL uniform shader declarations: albedo, normalMap, roughnessMap */}
          {/* No tx/ty — tiling is handled by mod() in the shader instead */}
          <ImageShader image={albedoImg} />
          <ImageShader image={normalImg} />
          <ImageShader image={roughnessImg} />
        </Shader>
      </Fill>
    </Canvas>
  );
}
