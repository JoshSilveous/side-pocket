# Side Pocket — Project Context

## What This Is

A mobile pool (billiards) tracking app — managing games, teams, players, turn order, and score history. Intended as a real App Store product, not just a personal tool.

**App name:** Side Pocket  
**Design direction:** Neon bar / billiards hall aesthetic. Think neon signs on a brick wall. This drove all UI decisions — no "native adaptive" look, fully custom themed.

---

## Tech Stack

| Thing | Choice | Notes |
|---|---|---|
| Framework | Expo (managed → dev client) | Dev client required from day one — native modules used |
| Router | Expo Router v56 (file-based) | `src/app/` directory, Next.js-style |
| State | Zustand + AsyncStorage persist | Not yet implemented — planned |
| Animations | Reanimated 4.3.1 | SharedValues drive most UI thread animations |
| Graphics | `@shopify/react-native-skia` 2.6.2 | All neon glow, background shader, particles |
| Language | TypeScript strict |
| Gestures | react-native-gesture-handler 2.31 |

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

### Light Registration Flow

1. `NeonLightSource` mounts → `useEffect` calls `measureAndRegister`
2. `measureAndRegister` calls `viewRef.current.measure()` then `containerRef.current.measure()` to get relative position (two `measure()` calls, NOT `measureLayout` — that's unreliable on new arch)
3. Calls `registerLight({ id, x, y, r, g, b, intensity, radius })`
4. `NeonRenderer` stores in `lights` state → re-renders `BrickBackground` + `DustParticles`

For colour/brightness updates (no position change — e.g. slider drag):
- Calls `updateLight(id, { r, g, b, intensity })` instead
- Skips the async `measure()` call entirely — much faster

### BrickBackground Shader (SkSL)

Full-screen `RuntimeEffect` shader. Samples three `ImageShader` children.

**Critical discoveries:**
- `ImageShader` CANNOT use `tx`/`ty` tile modes — throws `Invalid value for SkTileMode` at runtime in this Skia version. Tiling is done in SkSL via `mod(fragCoord * texScale, imgSize)` instead.
- `Canvas` with `absoluteFillObject` creates a zero-size surface on iOS (new arch). **Must pass explicit `width` and `height`** as the style.
- `float4 lightPos[8]` array uniforms silently fail on some mobile GPU backends. Use individual uniforms (`l0..l7`, `lc0..lc7`) instead.
- `Skia.RuntimeEffect.Make()` can throw (not just return null) on shader compile errors — wrap in try/catch.

**Texture coordinate math:**
```
texScale = tileCount * imgW / screenWidth   (isotropic — same for both axes)
tc = mod(fragCoord * texScale, imgSize)     (tiles within image bounds)
```
`tileCount` controls tiles across screen width; height tiles naturally from image aspect ratio.

**Lighting model:** Blinn-Phong with Reinhard tone mapping. Per-fragment: decode tangent-space normal from normalMap, compute diffuse + specular for each registered light, apply to albedo.

**Ambient:** `float3(0.18, 0.12, 0.14)` — dimly visible brick even with no neon.

### DustParticles

80 particles in React state, updated via `setInterval` at 30fps (Brownian motion). Each particle's visibility and colour is computed JS-side by checking distance to each registered light. Particles only appear near neon — opacity proportional to light influence. Canvas also needs explicit `width`/`height`.

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

## Performance Notes

- **Texture size matters enormously.** 4K textures with a large `texScale` cause catastrophic GPU cache misses. Keep wall textures at **1024×1024**. The `mod()` tiling approach samples the same pixels repeatedly which is cache-friendly.
- **React render cascade during slider drag** — each `onJsChange` tick causes: setState → NeonRenderer re-render → useMemo recomputes uniforms → Canvas redraws full-screen shader. Partially mitigated by `updateLight` (skips `measure()`). Further improvement would be passing uniforms as Reanimated `SharedValue` to bypass React entirely.
- **DustParticles `setInterval`** runs concurrent with drag renders — consider pausing during interaction in future.

---

## Planned But Not Yet Built

- **Zustand game state** — `GameState` shape designed (teams, players, turnOrder, scores, history)
- **Live Activities / Dynamic Island** — iOS only, phase 2. Swift Widget Extension + AppIntent bridge
- **Actual game screens** — home screen, active game screen, score tracking
- **Player/team management UI**

---

## Key Design Decisions

- **No Liquid Glass** (`@callstack/liquid-glass`) — dropped, conflicts aesthetically
- **Native UI deprioritised** — full neon theme takes priority over platform-adaptive look
- **Skia for everything visual** — glow, blur, shaders, particles — cross-platform consistency
- **Reanimated SharedValues for anything that animates** — brightness, slider positions etc. stay on UI thread
- **`Platform.OS` checks for platform-specific chrome** — same JS logic, different native UI components where needed
