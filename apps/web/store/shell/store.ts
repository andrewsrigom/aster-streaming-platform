import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface ShellState {
  dialog: "closed" | "profiles";
  step: "list" | "create";
  busy: boolean;
  notice:
    "selected" | "created" | "signed-in" | "signed-out" | "refresh" | "rejected" | "expired" | null;
}
const initialState: ShellState = { dialog: "closed", step: "list", busy: false, notice: null };
const shell = createSlice({
  name: "shell",
  initialState,
  reducers: {
    open(state) {
      state.dialog = "profiles";
      state.step = "list";
      state.notice = null;
    },
    close() {
      return initialState;
    },
    step(state, action: PayloadAction<ShellState["step"]>) {
      if (!state.busy) {
        state.step = action.payload;
        state.notice = null;
      }
    },
    busy(state, action: PayloadAction<boolean>) {
      state.busy = action.payload;
    },
    refreshed(state, action: PayloadAction<ShellState["notice"]>) {
      state.step = "list";
      state.busy = false;
      state.notice = action.payload;
    },
  },
});
export const shellActions = shell.actions;
export const createShellStore = () =>
  configureStore({ reducer: { shell: shell.reducer }, devTools: false });
export type ShellStore = ReturnType<typeof createShellStore>;
export type ShellRoot = ReturnType<ShellStore["getState"]>;
