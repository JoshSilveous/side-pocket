import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  useImage,
  type SkImageSource,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet } from "react-native";

import type { LightSource } from "./types";

// ── SkSL shader ────────────────────────────────────────────────────────────
// Samples three textures (albedo, normal map, roughness map) and applies
// normal-mapped neon lighting.
//
// Coordinate convention:
//   fragCoord is in screen pixels.
//   texScale (uniform) converts screen coords to texture-tiling coords.
//   ImageShaders must use tx/ty="repeat" so the texture tiles correctly.
//
// Normal map convention: standard OpenGL tangent-space.
//   R = +X (right), G = +Y (up in tangent space), B = +Z (surface normal).
//   Flat surface = RGB(128, 128, 255).
const TEXTURE_SHADER = `
uniform shader albedo;
uniform shader normalMap;
uniform shader roughnessMap;
uniform float2 iResolution;
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
    float2 tc = mod(fragCoord * texScale, imgSize);

    half4  albedoSample = albedo.eval(tc);
    half4  normalSample = normalMap.eval(tc);
    float  roughness    = roughnessMap.eval(tc).r;

    // Decode tangent-space normal: [0,1] -> [-1,1]
    float3 N = normalize(float3(normalSample.rg * 2.0 - 1.0, normalSample.b));

    // Near-black ambient — bricks almost invisible without neon (~2%)
    float3 totalLight = float3(0.02, 0.012, 0.015);

    if (numLights > 0) { totalLight += applyLight(l0, lc0, fragCoord, N, roughness, wallZ); }
    if (numLights > 1) { totalLight += applyLight(l1, lc1, fragCoord, N, roughness, wallZ); }
    if (numLights > 2) { totalLight += applyLight(l2, lc2, fragCoord, N, roughness, wallZ); }
    if (numLights > 3) { totalLight += applyLight(l3, lc3, fragCoord, N, roughness, wallZ); }
    if (numLights > 4) { totalLight += applyLight(l4, lc4, fragCoord, N, roughness, wallZ); }
    if (numLights > 5) { totalLight += applyLight(l5, lc5, fragCoord, N, roughness, wallZ); }
    if (numLights > 6) { totalLight += applyLight(l6, lc6, fragCoord, N, roughness, wallZ); }
    if (numLights > 7) { totalLight += applyLight(l7, lc7, fragCoord, N, roughness, wallZ); }

    // Reinhard tone map then apply to albedo
    totalLight = totalLight / (totalLight + float3(1.0));
    return half4(half3(albedoSample.rgb * totalLight), 1.0);
}
`;

const MAX_LIGHTS = 8;

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
  albedo: SkImageSource;
  /** OpenGL tangent-space normal map. Flat = RGB(128,128,255). */
  normalMap: SkImageSource;
  /** Greyscale roughness map. White = fully rough/diffuse. */
  roughnessMap: SkImageSource;
};

type Props = {
  lights: LightSource[];
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
  lights,
  width,
  height,
  textures,
  tileCount = 4,
  wallZ = 220,
}: Props) {
  const albedoImg    = useImage(textures?.albedo    ?? null);
  const normalImg    = useImage(textures?.normalMap  ?? null);
  const roughnessImg = useImage(textures?.roughnessMap ?? null);

  const uniforms = useMemo(() => {
    if (!albedoImg) return null;

    // Scale screen-pixel coords into texture-pixel coords so that
    // `tileCount` full tiles appear across the screen width.
    // Aspect ratio is preserved from the albedo image dimensions.
    const imgW = albedoImg.width();
    const imgH = albedoImg.height();
    // Isotropic scale — both axes use the same value so the texture's
    // natural aspect ratio is preserved. tileCount controls tiles across width;
    // tile height follows naturally from the image's own proportions.
    const scaleX = (tileCount * imgW) / width;
    const scaleY = scaleX;

    const L = (i: number): number[] => lights[i]
      ? [lights[i].x, lights[i].y, lights[i].radius, lights[i].intensity]
      : [0, 0, 0, 0];
    const C = (i: number): number[] => lights[i]
      ? [lights[i].r, lights[i].g, lights[i].b, 0]
      : [0, 0, 0, 0];

    return {
      iResolution: [width, height],
      texScale: [scaleX, scaleY],
      imgSize: [imgW, imgH],
      wallZ,
      numLights: Math.min(lights.length, MAX_LIGHTS),
      l0: L(0), lc0: C(0),
      l1: L(1), lc1: C(1),
      l2: L(2), lc2: C(2),
      l3: L(3), lc3: C(3),
      l4: L(4), lc4: C(4),
      l5: L(5), lc5: C(5),
      l6: L(6), lc6: C(6),
      l7: L(7), lc7: C(7),
    };
  }, [albedoImg, lights, width, height, tileCount, wallZ, brickScrollY]);

  // Wait until all three textures are loaded and shader compiled
  if (!textureEffect || !uniforms || !albedoImg || !normalImg || !roughnessImg) {
    return null; // NeonRenderer's black background shows through
  }

  return (
    <Canvas style={{ position: "absolute", top: 0, left: 0, width, height }} pointerEvents="none">
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

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});
