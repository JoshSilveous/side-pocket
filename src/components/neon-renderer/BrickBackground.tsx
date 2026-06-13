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

// ── Light model ──────────────────────────────────────────────────────────────
// The wall is lit by EMITTER POINTS sampled along each tube path (never a centre).
// We flatten every tube's emitters into one array of point-lights; each tube splits
// its intensity across the emitters we keep, so total wall brightness stays ≈ one
// light's worth — just sourced from the outline. Reinhard compresses any overlap.
const MAX_EMITTERS = 16;
/** Max emitters kept per tube for the (soft, coarse) wall wash. */
const BRICK_EMITTERS_PER_LIGHT = 8;
/** Per-emitter falloff reach (px). A little tighter than the old center-light radius. */
const BRICK_REACH = 340;

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
const TEXTURE_SHADER = `
uniform shader albedo;
uniform shader normalMap;
uniform shader roughnessMap;
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

    for (int i = 0; i < ${MAX_EMITTERS}; i++) {
        if (i >= numEmitters) { break; }
        totalLight += applyLight(emitters[i], emitterColors[i], sc, N, roughness, wallZ);
    }

    // Reinhard tone map then apply to albedo
    totalLight = totalLight / (totalLight + float3(1.0));
    return half4(half3(albedoSample.rgb * totalLight), 1.0);
}
`;

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
  scrollShared: SharedValue<number>;
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
  scrollShared,
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
  // Brightness flicker, slider drags AND scroll update shared values on the UI
  // thread, so the brick redraws without any React reconciliation. Each tube's
  // emitters are strided to BRICK_EMITTERS_PER_LIGHT and its intensity split across
  // them; emitter Y is content-space, so we subtract the live scroll offset.
  const uniforms = useDerivedValue(() => {
    "worklet";
    const lights = lightsShared.value;
    const intens = intensityShared.value;
    const scroll = scrollShared.value;

    const emitters: number[] = new Array(MAX_EMITTERS * 4).fill(0);
    const emitterColors: number[] = new Array(MAX_EMITTERS * 4).fill(0);
    let count = 0;

    for (let k = 0; k < lights.length && count < MAX_EMITTERS; k++) {
      const l = lights[k];
      const em = l.emitters;
      const pts = em.length / 2;
      if (pts <= 0) continue;

      const take = Math.min(BRICK_EMITTERS_PER_LIGHT, pts);
      const stride = pts / take;
      const intensity = (intens[l.id] ?? l.intensity) / take;

      for (let s = 0; s < take && count < MAX_EMITTERS; s++) {
        const idx = Math.floor(s * stride) * 2;
        const o = count * 4;
        emitters[o] = em[idx];
        emitters[o + 1] = em[idx + 1] - scroll;
        emitters[o + 2] = BRICK_REACH;
        emitters[o + 3] = intensity;
        emitterColors[o] = l.r;
        emitterColors[o + 1] = l.g;
        emitterColors[o + 2] = l.b;
        emitterColors[o + 3] = 0;
        count++;
      }
    }

    return {
      screenScale: 1 / BRICK_RENDER_SCALE,
      texScale: [scaleX, scaleX],
      imgSize: [imgW, imgH],
      wallZ,
      numEmitters: count,
      emitters,
      emitterColors,
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
