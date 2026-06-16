# Side Pocket — Project Context

## What This Is

A mobile pool (billiards) tracking app — managing games, teams, players, turn order, and score history. Intended as a real App Store product, not just a personal tool.

**App name:** Side Pocket  
**Design direction:** Neon bar / billiards hall aesthetic. Think neon signs on a brick wall. This drove all UI decisions — no "native adaptive" look, fully custom themed.

---

## Tech Stack

| Thing      | Choice                             | Notes                                                  |
| ---------- | ---------------------------------- | ------------------------------------------------------ |
| Framework  | Expo (managed → dev client)        | Dev client required from day one — native modules used |
| Router     | Expo Router v56 (file-based)       | `src/app/` directory, Next.js-style                    |
| State      | Zustand + AsyncStorage persist     | Not yet implemented — planned                          |
| Animations | Reanimated 4.3.1                   | SharedValues drive most UI thread animations           |
| Graphics   | `@shopify/react-native-skia` 2.6.2 | All neon glow, background shader, particles            |
| Language   | TypeScript strict                  |
| Gestures   | react-native-gesture-handler 2.31  |

**React Native version:** 0.85.3 (new architecture / Fabric enabled)  
**React version:** 19.2.3

---

## Development Workflow

- **Windows machine:** Primary JS dev, runs Metro bundler (`expo start`)
- **Mac (Intel MacBook Air 2020):** iOS dev client builds, Xcode, Swift work
- **Git:** Bridge between machines
- **EAS Build:** Cloud iOS builds when Mac iteration is too slow
- **Distribution:** App Store + Google Play (not yet submitted)

The iOS app is built on Mac and manually pointed to the Windows Metro server IP. "Open DevTools" in the Expo dev menu may not work in this setup. Use `npx react-devtools` in a terminal on the Windows machine instead — it auto-connects.

---

## Project Structure

```
src/
  app/                          Expo Router screens
    _layout.tsx                 Tab navigator (NativeTabs from expo-router)
    index.tsx                   Home screen
    explore.tsx                 Explore screen
    ui-testing.tsx              Dev sandbox for UI components
  components/
    neon-tube.tsx               Core neon glow path renderer (Skia)
    neon-button.tsx             Button built on NeonTube
    neon-slider.tsx             Slider with gradient track (Skia + Reanimated)
    neon-renderer/              Full-screen neon environment renderer
      NeonRenderer.tsx          Root provider — black bg, hosts canvas layers
      NeonLightSource.tsx       Wrapper that registers a component as a light
      BrickBackground.tsx       SkSL shader — brick wall with normal map lighting
      DustParticles.tsx         Floating dust motes, lit by registered neons
      NeonRendererContext.ts    React context + useNeonRenderer hook
      types.ts                  LightSource, NeonRendererContextValue
      utils.ts                  hueToRgb, hueToWarmRgb, rgbToHex
      index.ts                  Public exports
  constants/
    theme.ts                    Colors, Fonts, Spacing, BottomTabInset, MaxContentWidth
  hooks/
    use-color-scheme.ts
    use-theme.ts
assets/
  textures/
    brick_albedo.png            1024x1024 — Poliigon BrickWallReclaimed_8320 BaseColor
    brick_normal.png            1024x1024 — same pack, Normal (OpenGL tangent-space)
    brick_roughness.png         1024x1024 — same pack, Roughness
```

---

## NeonRenderer Architecture

This is the most complex system in the codebase. Read this before touching it.

### Overview

```
<NeonRenderer wallTextures={...} tileCount={0.8}>
  ← Layer 0: BrickBackground Canvas (absoluteFill, explicit w/h)
  ← Layer 1: children (app content, transparent backgrounds)
  ← Layer 2: DustParticles Canvas (absoluteFill, explicit w/h)
```

A React context (`NeonRendererContext`) holds a registry of light sources. Any component wrapped in `<NeonLightSource>` registers its screen position, colour, and intensity. The `BrickBackground` shader and `DustParticles` read from this registry.

### Light Model: Emitter-Based Path Lighting

**As of June 2026:** Lights are no longer single center-points. Instead, each light is an array of **emitter points sampled along the tube path** (via `Skia.ContourMeasureIter`). This design:
- Removes all center-of-mass binding — works for *any* path (hollow buttons, custom animated signs, etc.)
- Stores emitters in **content coordinates**; scroll offset is subtracted on-the-fly so lit spots track buttons
- Allows per-tube density tuning via `EMITTER_SPACING` (~12px)

**Registration flow:**
1. `NeonLightSource` mounts → `measureAndRegister()` 
2. Calls `measure()` twice to get box position (rel X/Y + scroll)
3. Builds tube path: default = bounding-box rounded-rect (matches button outline); optional `tubePath` prop for custom shapes
4. Walks path with `ContourMeasureIter`, samples points every ~12px into `emitters: number[]` (flat `[x0,y0,x1,y1,…]`)
5. Calls `registerLight({ id, emitters, r, g, b, intensity })`
6. `NeonRenderer` stores in `lightsShared` (Reanimated mirror) + context

**Brightness updates (flicker/slider):**
- Write to `intensityShared: SharedValue<Record<id, intensity>>` on UI thread (via `useAnimatedReaction`)
- No React re-render — consumers (dust worklet, brick uniforms) read live brightness directly

**Scroll tracking:**
- `NeonRenderer` accepts `scrollOffset?: SharedValue<number>` (from `useScrollOffset`)
- Stored as `scrollShared` in context
- Consumers subtract live scroll from emitter Y coords on-the-fly (UI thread, negligible cost)

### BrickBackground Shader (SkSL)

Full-screen `RuntimeEffect` shader. Samples three `ImageShader` children (albedo, normal, roughness).

**Lighting:** Blinn-Phong with Reinhard tone mapping from **emitter point-lights** (not centers). Uniforms include:
- `float4 emitters[MAX_EMITTERS]` — `(x, y, reach, intensity)` in screen coords
- `float4 emitterColors[MAX_EMITTERS]` — `(r, g, b, _)`
- `numEmitters` count + loop with early cull per pixel (perf-safe)

Per-emitter falloff: `atten = (1 - dist/reach)^4` (steep curve, bright close-in, drops fast). Each tube splits intensity across emitters (`BRICK_EMITTERS_PER_LIGHT = 4`); intensity multiplied by 3× in uniforms worklet to brighten the brick behind tubes.

**Texture coordinate math:**
```
texScale = tileCount * imgW / screenWidth   (isotropic)
tc = mod(fragCoord * texScale, imgSize)     (mod-based tiling, not ImageShader tx/ty)
```

**Reduced resolution:** Renders at `BRICK_RENDER_SCALE = 0.75`, upscaled via transform (imperceptible, ~2× GPU savings).

**Ambient:** `float3(0.02, 0.012, 0.015)` — bricks nearly invisible without neon (~2%).

**Critical discoveries (Skia 2.6.2):**
- `ImageShader` CANNOT use `tx`/`ty` tile modes — use `mod()` in shader
- `Canvas` with `absoluteFillObject` creates 0×0 on iOS/new arch — pass explicit `width`/`height`
- `float4 arr[8]` array uniforms silently fail on some backends; `float4 emitters[N]` works fine
- `Skia.RuntimeEffect.Make()` throws (not null) on compile error — always try/catch

### DustParticles

**640 particles** (was 80; 4× increase after battery optimization) in a **single `<Atlas>` draw** advanced on the UI thread.

**Particle state:** Held in `SharedValue<Particle[]>`, simulated via `useFrameCallback` worklet at ~25fps (30fps was overkill; imperceptible difference). Brownian motion (drift + jitter) stays on UI thread — no React reconciliation per frame.

**Rendering:** `useRSXformBuffer` (position + scale), `useColorBuffer` (neon tint + opacity). One baked soft-dot sprite (`useTexture`) replaces live `BlurMask` — blur baked into the texture (1× draw instead of 80).

**Lighting (falloff curve):** Reads `lightsShared` + `scrollShared` + `intensityShared` on UI thread. Per particle:
- Closeness = `1 - dist_to_nearest_emitter / DUST_REACH` (130px reach)
- Curve is **tight & dramatic**: imperceptible (<50%), ramps 50–90%, white-hot spike at tube
- Formula: `shape = CURVE_MID·smoothstep(0.5,0.9,c) + (1−CURVE_MID)·smoothstep(0.95,1,c)` where `CURVE_MID = 0.35`
- Color ramps grey→tube-hue (50–90%) then blends→white (90–100%)
- Ambient floor (`AMBIENT_OPACITY = 0.02`) keeps far dust barely visible

**Pause when off-screen:** Frame callback disabled via `useIsFocused()` + `AppState` — no background drain.

---

## NeonTube Component

The core neon glow primitive. Takes an SVG path string and renders it as a multi-pass neon tube in its own Skia `Canvas`. Passes:

1. Outer atmospheric bloom (wide blur, low opacity)
2. Mid halo (medium blur)
3. Tube body (stroke with blur)
4. Warm core (lighter colour, thin)
5. White hot center (hairline)

`brightness` accepts either a `SharedValue<number>` or a plain number. Opacity is driven by `useAnimatedStyle` so glow dims/brightens on the UI thread without JS renders.

`NeonButton` builds on `NeonTube` — measures its own layout via `onLayout`, builds a rounded-rect SVG path, renders `NeonTube` as an absolute overlay.

---

## Skia / React Native Skia Gotchas (v2.6.2)

- **Canvas needs explicit `width`/`height` in style** — `absoluteFillObject` alone creates a 0×0 surface
- **TileMode enum doesn't work for ImageShader** — use `mod()` in shader instead
- **Array uniforms (`float4 arr[8]`)** — silently fail on some backends; use individual uniforms
- **`Skia.RuntimeEffect.Make()` throws on compile error** — always wrap in try/catch
- **Child shaders (ImageShader inside Shader)** — coordinate system is image pixel space; `eval(float2(x,y))` samples pixel (x,y) of the image
- **`measureLayout` is unreliable on RN new arch** — use double `measure()` instead
- **`useImage()` is async even for local assets** — returns null on first render, then the image; gates any Canvas that needs it

---

## Performance Notes & Optimizations (June 2026)

### Battery Optimization Summary
- **DustParticles:** Collapsed from 80-per-frame React-reconciled circles (+ 80 live `BlurMask` GPU layers) → **single Atlas draw** at 25fps on UI thread. ~17% work reduction + massive GC relief.
- **Brick shader:** Moved to **emitter-based uniforms `useDerivedValue`** (UI-thread, no React re-render on brightness change). Reduced internal render resolution to 0.75× (imperceptible, ~2× GPU savings).
- **Lights architecture:** `lightsShared` + `intensityShared` `SharedValue` mirrors let consumers (dust, brick) read lighting on UI thread without any JS re-render per frame.

### Tuning Notes
- **Dust reach vs. intensity:** Increasing falloff exponent (atten^2 → atten^4) darkens everything close-in. **Solution:** boost intensity multiplier (3×) + reduce emitters per tube (8→4) instead.
- **Texture size:** 4K + large `texScale` = GPU cache misses. Keep wall textures at **1024×1024**; `mod()` tiling is cache-friendly.
- **Brick redraws every scroll frame** (perf risk if emitter count balloons). Currently safe with `MAX_EMITTERS=16`, `BRICK_EMITTERS_PER_LIGHT=4`. Future complex signs → switch to glow-map if needed.
- **Dust simulation pauses when app backgrounded** (via `useIsFocused()` + `AppState`) — zero idle drain.

### Reanimated UI-Thread Worklets
All animation stays on UI thread:
- Dust simulation (`useFrameCallback`)
- Dust color + transform buffers (`useColorBuffer`, `useRSXformBuffer`)
- Brick uniforms (`useDerivedValue` reading lights + scroll)
- Brightness/intensity updates (via `useAnimatedReaction`)

No setState → no React render cascade on slider drag, flicker, or scroll.

---

## Built (Recent)

- **Battery optimization (June 2026)** — Dust particles collapsed to single Atlas draw (25fps UI thread, 640 particles). Brick shader emitter-based, reduced-res. Lighting tracks scroll. Battery drain cut from "3D game-like" to acceptable idle.
- **Emitter-based tube lighting** — Lights sampled along tube paths (arbitrary custom shapes possible). No center-of-mass binding.
- **Scroll tracking** — Lit spots follow buttons; textures stay fixed. `useScrollOffset` + `scrollShared`.

## Planned But Not Yet Built

- **Zustand game state** — `GameState` shape designed (teams, players, turnOrder, scores, history)
- **Live Activities / Dynamic Island** — iOS only, phase 2. Swift Widget Extension + AppIntent bridge
- **Actual game screens** — home screen, active game screen, score tracking
- **Player/team management UI**
- **Custom neon-sign paths** — `NeonLightSource` tubePath prop is the extension point; demo with animated paths

---

## Key Design Decisions

- **No Liquid Glass** (`@callstack/liquid-glass`) — dropped, conflicts aesthetically
- **Native UI deprioritised** — full neon theme takes priority over platform-adaptive look
- **Skia for everything visual** — glow, blur, shaders, particles — cross-platform consistency
- **Reanimated SharedValues for everything that animates** — brightness, slider positions, scroll, lighting all stay on UI thread (no React re-render per frame)
- **`Platform.OS` checks for platform-specific chrome** — same JS logic, different native UI components where needed
- **Path-based emitter lighting** — tubing geometry drives light, not center-of-mass; extensible to arbitrary custom signs

## Tunable Constants (DustParticles & BrickBackground)

**Dust:**
- `PARTICLE_COUNT` — 640 (was 80; 4× increase is cheap in single Atlas draw)
- `DUST_REACH` — 130px (distance at which closeness hits 0)
- `CURVE_MID` — 0.35 (opacity plateau band, 0.9–0.99 closeness)
- `AMBIENT_OPACITY` — 0.02 (faint grey floor when far from tubes)
- Particle size: `0.8 + Math.random() * 1.2` px

**Brick:**
- `BRICK_REACH` — 500px (emitter falloff reach)
- `MAX_EMITTERS` — 16 (hard cap; current use ~4–8)
- `BRICK_EMITTERS_PER_LIGHT` — 4 (each tube uses 4 emitters; intensity = `original / 4 * 3`)
- `BRICK_RENDER_SCALE` — 0.75 (internal render res; 1.0 = disable)
- Falloff exponent: `atten^4` (quartic, drops fast at distance)

Tune these on-device if needed. Brick perf risk if emitters balloon; dust cost negligible (single draw).
