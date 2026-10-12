export type RenderQuality = "full" | "performance";

// Temporary Android test default. Set false after device testing to restore full
// quality everywhere; a future settings page can pass NeonRenderer's quality prop.
export const ANDROID_PERFORMANCE_MODE = true;

export const RENDER_QUALITY = {
    full: {
        particleCount: 640,
        wallRenderScale: 0.75,
        wallLightingFps: 0, // Follow every lighting update.
        wallSpecular: true,
    },
    performance: {
        particleCount: 160,
        wallRenderScale: 0.5,
        wallLightingFps: 30,
        wallSpecular: false,
    },
} as const;
