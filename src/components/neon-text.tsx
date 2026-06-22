import {
    BlurMask,
    Canvas,
    Group,
    Text as SkiaText,
    useFont,
} from "@shopify/react-native-skia";
import { TiltNeon_400Regular } from "@expo-google-fonts/tilt-neon";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
    useAnimatedReaction,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    type SharedValue,
} from "react-native-reanimated";

import { useNeonRenderer } from "./neon-renderer/NeonRendererContext";
import { hexToRgb01 } from "./side-pocket/utils";

// ════════════════════════════════════════════════════════════════════════════
//  NEON TEXT LOOK — tweak the glow here.
//  Same idea as the tubes (<PathTube>): the crisp glyph is the hot white core,
//  blurred coloured copies underneath bloom outward into the neon glow. Tilt Neon
//  is already a thin monoline, so the letters themselves read as the tube core.
//  All blur radii are a fraction of FONT SIZE, then scaled by the `glow` prop.
// ════════════════════════════════════════════════════════════════════════════

/** Outer atmospheric bloom (drawn twice). */
const BLOOM_BLUR = 0.45;
/** Mid halo around the letters. */
const HALO_BLUR = 0.18;
/** Coloured glow hugging the glyphs. */
const BODY_BLUR = 0.06;
/** Warm inner glow just inside the core. */
const WARM_BLUR = 0.04;
/** Soft white halo right around the hot core. */
const HOT_BLUR = 0.03;

/** Faint grey so the label stays legible even when unlit (brightness 0). */
const COLD_TEXT_COLOR = "#6a6a72";

/** Bloom reach multiplier cap — brightness drives bloom blur up to this (overdrive
 *  past 100% = wider reach). Keep in sync with neon-tube's BLOOM_REACH_MAX. */
const BLOOM_REACH_MAX = 3;

/** Max emitter points fed to the lighting pass for the whole string. Small: the
 *  dust worklet loops every emitter of every light per particle (640x). */
const MAX_TEXT_EMITTERS = 10;

export type NeonTextProps = {
    children: string;
    /** Font size in px. Everything (glow radii, layout) scales off this. */
    fontSize?: number;
    color?: string;
    warmColor?: string;
    /** Colour of the hot core. White reads as classic neon; tint for a softer look. */
    coreColor?: string;
    /** Glow spread multiplier. 1 = stock, >1 = wider/softer, <1 = tighter. */
    glow?: number;
    brightness?: SharedValue<number> | number;
    /** Extra canvas margin so the outer bloom isn't clipped. */
    glowPadding?: number;
    /**
     * Register the text as a NeonRenderer light so the brick wall + dust react to
     * it exactly like the tubes. Requires being rendered inside <NeonRenderer>.
     * Default: true.
     */
    emitLight?: boolean;
};

/**
 * Arbitrary runtime text rendered as a neon sign, using the same multi-pass glow
 * recipe as the tubes and registering itself as a light so dust + the wall react
 * seamlessly. Unlike the tubes/SVGs (which light from a *path*), the light here is
 * sampled from per-glyph layout boxes — but the renderer's light model is just a
 * bag of emitter points, so it doesn't care where they came from.
 */
export function NeonText({
    children: text,
    fontSize = 32,
    color = "#ff2020",
    warmColor = "#ff9999",
    coreColor = "#ffffff",
    glow = 1,
    brightness,
    glowPadding = 32,
    emitLight = true,
}: NeonTextProps) {
    const id = useId();
    const renderer = useNeonRenderer();
    // Stash in a ref: the context object is recreated whenever a light registers,
    // so depending on it directly would re-fire the register effect → loop.
    const rendererRef = useRef(renderer);
    rendererRef.current = renderer;
    const viewRef = useRef<View>(null);

    const font = useFont(TiltNeon_400Regular, fontSize);

    // Normalise brightness to a single SharedValue.
    const staticB = useSharedValue(
        typeof brightness === "number" ? brightness : 1,
    );
    const bv: SharedValue<number> =
        brightness !== undefined && typeof brightness !== "number"
            ? brightness
            : staticB;
    useEffect(() => {
        if (typeof brightness === "number") staticB.value = brightness;
    }, [brightness, staticB]);

    // ── Layout: advance width + vertical metrics → baseline + canvas size ──
    const layout = useMemo(() => {
        if (!font) return null;
        const { ascent, descent } = font.getMetrics();
        const ids = font.getGlyphIDs(text);
        const widths = font.getGlyphWidths(ids);
        const advance = widths.reduce((s, w) => s + w, 0);

        const textHeight = descent - ascent;

        // The View lays out at the text's NATURAL size; the glow canvas is bigger
        // and overflows via negative offset (like <NeonTube>) so glowPadding never
        // inflates layout height. drawX/drawY place the glyphs inside that bigger
        // canvas so the ink lands at the View's top-left (0,0).
        const drawX = glowPadding;
        const drawY = glowPadding - ascent; // ascent is negative
        const midY = textHeight / 2; // vertical centre of ink, in View coords

        // Per-glyph emitter candidates in View coords (skip whitespace — no ink).
        const candidates: number[] = []; // flat [x,y,...]
        let x = 0;
        for (let i = 0; i < widths.length; i++) {
            const ch = text[i];
            if (ch && ch.trim() !== "") {
                candidates.push(x + widths[i] / 2, midY);
            }
            x += widths[i];
        }

        // Downsample to MAX_TEXT_EMITTERS so the dust worklet stays cheap.
        const pairCount = candidates.length / 2;
        const localEmitters: number[] = [];
        if (pairCount > 0) {
            const step = Math.max(1, Math.ceil(pairCount / MAX_TEXT_EMITTERS));
            for (let p = 0; p < pairCount; p += step) {
                localEmitters.push(candidates[p * 2], candidates[p * 2 + 1]);
            }
        }

        return {
            drawX,
            drawY,
            width: advance, // View = natural text size (no glow padding)
            height: textHeight,
            canvasWidth: advance + glowPadding * 2,
            canvasHeight: textHeight + glowPadding * 2,
            localEmitters,
        };
    }, [font, text, glowPadding]);

    // ── Light registration (brick + dust react to the text) ──
    const [lr, lg, lb] = hexToRgb01(color);
    const lightParams = useRef({ r: lr, g: lg, b: lb });
    lightParams.current = { r: lr, g: lg, b: lb };

    const measureAndRegister = useCallback(() => {
        const rdr = rendererRef.current;
        if (!emitLight || !rdr || !viewRef.current || !layout) return;
        const container = rdr.containerRef.current;
        if (!container) return;
        const local = layout.localEmitters;
        if (local.length === 0) return;

        viewRef.current.measure((_, __, w, h, pageX, pageY) => {
            if (w === 0 && h === 0) return;
            container.measure((___, ____, _cw, _ch, cPageX, cPageY) => {
                // View top-left in container coords. Emitters are in View coords
                // (natural text box, no glow padding), so just offset by the corner.
                const offX = pageX - cPageX;
                const offY = pageY - cPageY;
                const scrollY = rdr.scrollShared.value;
                const emitters: number[] = [];
                for (let i = 0; i < local.length; i += 2) {
                    emitters.push(offX + local[i], offY + local[i + 1] + scrollY);
                }
                const lp = lightParams.current;
                rdr.registerLight({
                    id,
                    emitters,
                    r: lp.r,
                    g: lp.g,
                    b: lp.b,
                    // Power can exceed 1 (overdrive). The brick shader tone-maps and
                    // the dust clamps its own alpha, so >1 is safe and reads brighter.
                    intensity: bv.value,
                });
            });
        });
    }, [emitLight, layout, id, bv]);

    // Register on mount + whenever the geometry changes.
    useEffect(() => {
        measureAndRegister();
    }, [measureAndRegister]);

    // Colour change → update without re-measuring.
    useEffect(() => {
        if (emitLight)
            rendererRef.current?.updateLight(id, { r: lr, g: lg, b: lb });
    }, [emitLight, id, lr, lg, lb]);

    // Live brightness/flicker → intensityShared on the UI thread (no re-render).
    const intensityShared = renderer?.intensityShared ?? null;
    useAnimatedReaction(
        () => bv.value,
        (v) => {
            "worklet";
            if (!intensityShared) return;
            const next = Object.assign({}, intensityShared.value);
            next[id] = v < 0 ? 0 : v; // power can exceed 1 (overdrive); floor at 0
            intensityShared.value = next;
        },
        [id, intensityShared],
    );

    useEffect(() => {
        return () => {
            rendererRef.current?.unregisterLight(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Visual glow ──
    // Opacity carries the 0→100% fade-in; bloom reach (below) carries intensity past
    // 100%, so brightness reads like power to the tube.
    const canvasAnimatedStyle = useAnimatedStyle(() => {
        const b = Math.max(0, Math.min(1, bv.value));
        return { opacity: Math.pow(b, 0.7) };
    });

    // Bloom + halo reach scale with brightness (UI thread). Declared before the
    // early return so hook order stays stable; base radii inlined since the const
    // versions are computed after the return.
    const reach = useDerivedValue(() => {
        const b = bv.value;
        return b < 0 ? 0 : b > BLOOM_REACH_MAX ? BLOOM_REACH_MAX : b;
    });
    const bloomBlurV = useDerivedValue(
        () => fontSize * BLOOM_BLUR * glow * reach.value,
    );
    const haloBlurV = useDerivedValue(
        () => fontSize * HALO_BLUR * glow * reach.value,
    );

    if (!font || !layout) {
        // Font still loading (async, returns null first render) — nothing to draw.
        return null;
    }

    const { drawX, drawY, width, height, canvasWidth, canvasHeight } = layout;
    const posStyle = { width, height };
    // The glow canvas is bigger than the View and offset by -glowPadding so the
    // bloom overflows without affecting layout (same trick as <NeonTube>).
    const canvasStyle = {
        position: "absolute" as const,
        left: -glowPadding,
        top: -glowPadding,
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: "transparent",
    };

    // bloomBlur/haloBlur are reactive (bloomBlurV/haloBlurV above); these stay fixed.
    const bodyBlur = fontSize * BODY_BLUR * glow;
    const warmBlur = fontSize * WARM_BLUR * glow;
    const hotBlur = fontSize * HOT_BLUR * glow;

    return (
        <View
            ref={viewRef}
            pointerEvents="none"
            style={posStyle}
            onLayout={measureAndRegister}
        >
            {/* ── Cold text: always visible, no brightness control (unlit glass) ── */}
            <Canvas style={canvasStyle}>
                <SkiaText
                    font={font}
                    text={text}
                    x={drawX}
                    y={drawY}
                    color={COLD_TEXT_COLOR}
                />
            </Canvas>

            {/* ── Animated glow layers: fade with brightness ── */}
            <Animated.View
                pointerEvents="none"
                style={[canvasStyle, canvasAnimatedStyle]}
            >
                <Canvas
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: "transparent" },
                    ]}
                >
                    <Group>
                        {/* Outer bloom x2 */}
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={color}
                            opacity={0.5}
                        >
                            <BlurMask blur={bloomBlurV} style="normal" />
                        </SkiaText>
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={color}
                            opacity={0.5}
                        >
                            <BlurMask blur={bloomBlurV} style="normal" />
                        </SkiaText>

                        {/* Mid halo */}
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={color}
                        >
                            <BlurMask blur={haloBlurV} style="normal" />
                        </SkiaText>

                        {/* Coloured body hugging the glyphs */}
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={color}
                        >
                            <BlurMask blur={bodyBlur} style="normal" />
                        </SkiaText>

                        {/* Warm inner glow */}
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={warmColor}
                        >
                            <BlurMask blur={warmBlur} style="normal" />
                        </SkiaText>

                        {/* Soft white halo around the core */}
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={coreColor}
                            opacity={0.85}
                        >
                            <BlurMask blur={hotBlur} style="normal" />
                        </SkiaText>

                        {/* Hot core — the crisp glyphs themselves (no blur) */}
                        <SkiaText
                            font={font}
                            text={text}
                            x={drawX}
                            y={drawY}
                            color={coreColor}
                        />
                    </Group>
                </Canvas>
            </Animated.View>
        </View>
    );
}
