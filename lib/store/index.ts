import { configureStore } from '@reduxjs/toolkit';
import bundleReducer from './bundleSlice';
// Import other reducers as needed

export const store = configureStore({
  reducer: {
    bundles: bundleReducer,
    // Add other reducers here
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
