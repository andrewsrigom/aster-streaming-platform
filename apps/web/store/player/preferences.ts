import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const PLAYER_PREFERENCES_KEY = "aster.player.preferences.v1";
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  rate: number;
  captions: "off" | "on";
  quality: "auto" | number;
}
export const defaultPlayerPreferences: Readonly<PlayerPreferences> = Object.freeze({
  volume: 0.8,
  muted: false,
  rate: 1,
  captions: "off",
  quality: "auto",
});

export function normalizePlayerPreferences(value: unknown): PlayerPreferences {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const volume = record["volume"];
  const rate = record["rate"];
  const quality = record["quality"];
  return {
    volume:
      typeof volume === "number" && Number.isFinite(volume) && volume >= 0 && volume <= 1
        ? Math.round(volume * 100) / 100
        : defaultPlayerPreferences.volume,
    muted: record["muted"] === true,
    rate: typeof rate === "number" && playbackRates.some((value) => value === rate) ? rate : 1,
    captions: record["captions"] === "on" ? "on" : "off",
    quality:
      typeof quality === "number" && Number.isInteger(quality) && quality >= 144 && quality <= 4320
        ? quality
        : "auto",
  };
}

export function readPlayerPreferences(storage: Pick<Storage, "getItem">): PlayerPreferences {
  try {
    const raw = storage.getItem(PLAYER_PREFERENCES_KEY);
    if (!raw || raw.length > 512) {
      return { ...defaultPlayerPreferences };
    }
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    return value?.["version"] === 1
      ? normalizePlayerPreferences(value)
      : { ...defaultPlayerPreferences };
  } catch {
    return { ...defaultPlayerPreferences };
  }
}

export function writePlayerPreferences(
  storage: Pick<Storage, "setItem">,
  value: PlayerPreferences,
): void {
  try {
    storage.setItem(
      PLAYER_PREFERENCES_KEY,
      JSON.stringify({ version: 1, ...normalizePlayerPreferences(value) }),
    );
  } catch {
    // Browser privacy settings must not prevent playback.
  }
}

const player = createSlice({
  name: "player",
  initialState: { preferences: { ...defaultPlayerPreferences }, hydrated: false },
  reducers: {
    restore(state, action: PayloadAction<PlayerPreferences>) {
      state.preferences = normalizePlayerPreferences(action.payload);
      state.hydrated = true;
    },
    update(state, action: PayloadAction<Partial<PlayerPreferences>>) {
      state.preferences = normalizePlayerPreferences({ ...state.preferences, ...action.payload });
    },
  },
});
export const playerActions = player.actions;
export const playerReducer = player.reducer;
