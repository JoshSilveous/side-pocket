import {
    Canvas,
    Fill,
    ImageShader,
    Shader,
    Skia,
    useImage,
    type DataSourceParam,
} from "@shopify/react-native-skia";
import { useEffect, useRef } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { resolveFrame } from "./frame-math";
import type { FrameWorld, LightSource } from "./types";
import { RENDER_QUALITY, type RenderQuality } from "./render-quality";
import { useWallLighting } from "./useWallLighting";
import { buildWallShader, MAX_EMITTERS } from "./wall-shader";

// ── Light model ──────────────────────────────────────────────────────────────
// The wall is lit by EMITTER POINTS sampled along each tube path (never a centre).
// We flatten every tube's emitters into one array of point-lights; each tube splits
// its intensity across the emitters we keep, so total wall brightness stays ≈ one
// light's worth — just sourced from the outline. Reinhard compresses any overlap.
/** Max emitters kept per tube for the (soft, coarse) wall wash. With many lights
 *  (e.g. a per-path neon sign) the budget is split adaptively so each light still
 *  gets at least one wall emitter — see `perLight` below. */
const BRICK_EMITTERS_PER_LIGHT = 4;
/** Per-emitter falloff reach (px). Extended range for a more dramatic glow. */
const BRICK_REACH = 500;
/**
 * How much overdrive (power > 1) extends the wall reach. radius grows as
 * BRICK_REACH * (1 + (power - 1) * this), so a cranked tube throws light further
 * across the wall — the whole falloff stretches, not just the bright core.
 */
const BRICK_OVERDRIVE_REACH = 0.4;
/**
 * Extra damping for low-emitter (per-path neon sign) lights. A dense sign stacks
 * ~30 lights on the wall, which sum up and read too bright even at 1x each, so we
 * scale those down. Buttons (which use the full BRICK_EMITTERS_PER_LIGHT) are
 * unaffected. Lower = dimmer sign wall wash.
 */
const SIGN_WALL_GAIN = 0.2;

// Compile each shader variant once, on first use. Performance mode omits the
// roughness sampler and specular math entirely instead of branching per fragment.
const textureEffects = new Map<boolean, ReturnType<typeof Skia.RuntimeEffect.Make>>();
function getTextureEffect(specular: boolean) {
    if (!textureEffects.has(specular)) {
        let effect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
        try {
            effect = Skia.RuntimeEffect.Make(buildWallShader(specular));
            if (!effect) console.warn("[BrickBackground] Shader compilation failed.");
        } catch (error) {
            console.error("[BrickBackground] SkSL compile error:", error);
        }
        textureEffects.set(specular, effect);
    }
    return textureEffects.get(specular);
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
    quality?: RenderQuality;
    lightsShared: SharedValue<LightSource[]>;
    intensityShared: SharedValue<Record<string, number>>;
    scrollShared: SharedValue<number>;
    framesShared: SharedValue<Record<string, FrameWorld>>;
    framesVersion: SharedValue<number>;
    width: number;
    height: number;
    textures?: WallTextures;
    /**
     * How many tiles of the brick texture appear across the screen width.
     * Tune this to match the physical scale of your texture artwork. Default: 4
     */
    tileCount?: number;
    /** Called once, after textures + shader are loaded and a frame has drawn. */
    onReady?: () => void;
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
    framesShared,
    framesVersion,
    width,
    height,
    textures,
    tileCount = 4,
    wallZ = 220,
    quality = "full",
    onReady,
}: Props) {
    "use no memo";
    // Keep shared-value reads on the UI thread under React Compiler.
    const { wallRenderScale, wallLightingFps, wallSpecular } = RENDER_QUALITY[quality];
    const lighting = useWallLighting(
        lightsShared,
        intensityShared,
        scrollShared,
        framesShared,
        framesVersion,
        wallLightingFps,
    );
    const textureEffect = getTextureEffect(wallSpecular);
    const albedoImg = useImage(textures?.albedo ?? null);
    const normalImg = useImage(textures?.normalMap ?? null);
    const roughnessImg = useImage(wallSpecular ? textures?.roughnessMap ?? null : null);

    // Reduced-resolution canvas, upscaled to fill via a top-left transform.
    // Kept as floats (no rounding) so width*RES * (1/RES) lands exactly on `width`
    // — avoids a sub-pixel uncovered sliver at the right/bottom edge.
    const canvasW = Math.max(1, width * wallRenderScale);
    const canvasH = Math.max(1, height * wallRenderScale);

    // Isotropic texture scale — both axes share this so the texture keeps its
    // natural aspect ratio. Computed in *screen* space (independent of render res).
    const imgW = albedoImg ? albedoImg.width() : 1;
    const imgH = albedoImg ? albedoImg.height() : 1;
    const scaleX = (tileCount * imgW) / width;

    // Reactive uniforms: assembled on the UI thread from the shared light buffers.
    // Brightness flicker, slider drags AND scroll update shared values on the UI
    // thread, so the brick redraws without any React reconciliation. Each tube's
    // emitters are strided to BRICK_EMITTERS_PER_LIGHT and its intensity split across
    // them; emitters are frame-local, mapped through each frame's live transform.
    const uniforms = useDerivedValue(() => {
        "worklet";
        const snapshot = lighting.value;
        const lights = snapshot.lights;
        const intens = snapshot.intensities;
        const scroll = snapshot.scroll;
        const frames = snapshot.frames;

        const emitters: number[] = new Array(MAX_EMITTERS * 4).fill(0);
        const emitterColors: number[] = new Array(MAX_EMITTERS * 4).fill(0);
        let count = 0;

        // Split the emitter budget across lights: a couple of buttons get the full
        // BRICK_EMITTERS_PER_LIGHT each; a 30-path sign gets ~1 each. Keeps the
        // button wall wash identical while letting every path light the wall.
        // Only lights that can actually be seen share the budget, so hidden
        // stack screens don't starve the visible one.
        let visible = 0;
        for (let k = 0; k < lights.length; k++) {
            const f = resolveFrame(frames, lights[k].frameId, scroll);
            if (f && f.a > 0) visible++;
        }
        const perLight = Math.max(
            1,
            Math.min(
                BRICK_EMITTERS_PER_LIGHT,
                Math.floor(MAX_EMITTERS / Math.max(1, visible)),
            ),
        );

        for (let k = 0; k < lights.length && count < MAX_EMITTERS; k++) {
            const l = lights[k];
            const f = resolveFrame(frames, l.frameId, scroll);
            if (!f || f.a <= 0) continue;
            const em = l.emitters;
            const pts = em.length / 2;
            if (pts <= 0) continue;

            const take = Math.min(perLight, pts);
            const stride = pts / take;
            // The 3x boost assumes a light spreads across ~4 emitters (buttons). A
            // per-path sign light uses 1 emitter, so cap the boost at `take` (buttons
            // stay at 3x). Low-emitter sign lights also get SIGN_WALL_GAIN damping,
            // since ~30 of them overlap on the wall and otherwise read too bright.
            const boost = Math.min(3, take);
            const densityGain =
                take >= BRICK_EMITTERS_PER_LIGHT ? 1 : SIGN_WALL_GAIN;
            const power = (intens[l.id] ?? l.intensity) * f.a; // raw power, can exceed 1
            const intensity = (power / take) * boost * densityGain;
            // Overdrive (>1) stretches the falloff outward so the whole reach
            // brightens, not just the core.
            // A scaled-down tube throws a proportionally smaller glow.
            const radius =
                (power <= 1
                    ? BRICK_REACH
                    : BRICK_REACH * (1 + (power - 1) * BRICK_OVERDRIVE_REACH)) * f.s;

            for (let s = 0; s < take && count < MAX_EMITTERS; s++) {
                const idx = Math.floor(s * stride) * 2;
                const o = count * 4;
                emitters[o] = f.ox + f.s * em[idx];
                emitters[o + 1] = f.oy + f.s * em[idx + 1];
                emitters[o + 2] = radius;
                emitters[o + 3] = intensity;
                emitterColors[o] = l.r;
                emitterColors[o + 1] = l.g;
                emitterColors[o + 2] = l.b;
                emitterColors[o + 3] = 0;
                count++;
            }
        }

        return {
            screenScale: 1 / wallRenderScale,
            texScale: [scaleX, scaleX],
            imgSize: [imgW, imgH],
            wallZ,
            numEmitters: count,
            emitters,
            emitterColors,
        };
    }, [lighting, wallRenderScale, scaleX, imgW, imgH, wallZ]);

    const loaded =
        !!textureEffect &&
        !!albedoImg &&
        !!normalImg &&
        (!wallSpecular || !!roughnessImg);
    const readyFired = useRef(false);
    useEffect(() => {
        if (!loaded || readyFired.current) return;
        readyFired.current = true;
        // Two frames: one to mount the canvas, one for it to actually draw.
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
    }, [loaded, onReady]);

    // Wait for the textures used by this shader variant.
    if (!textureEffect || !albedoImg || !normalImg || (wallSpecular && !roughnessImg)) {
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
                transform: [{ scale: 1 / wallRenderScale }],
            }}
            pointerEvents="none"
        >
            <Fill>
                <Shader source={textureEffect} uniforms={uniforms}>
                    {/* Order must match SkSL uniform shader declarations: albedo, normalMap, roughnessMap */}
                    {/* No tx/ty — tiling is handled by mod() in the shader instead */}
                    <ImageShader image={albedoImg} />
                    <ImageShader image={normalImg} />
                    {wallSpecular && <ImageShader image={roughnessImg} />}
                </Shader>
            </Fill>
        </Canvas>
    );
}
