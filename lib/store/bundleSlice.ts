import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { fetchBundleData } from '../services/bundleService';

interface BundleState {
  rawData: any | null;
  bundles: any[];
  loading: boolean;
  error: string | null;
  selectedBundleId: string | null;
}

const initialState: BundleState = {
  rawData: null,
  bundles: [],
  loading: false,
  error: null,
  selectedBundleId: null,
};

// Async thunk for loading bundles
export const loadBundlesForRegion = createAsyncThunk(
  'bundles/loadBundlesForRegion',
  async (region: string) => {
    try {
      return await fetchBundleData(region);
    } catch (error: any) {
      throw error.message || 'Failed to load bundles';
    }
  }
);

export const bundleSlice = createSlice({
  name: 'bundles',
  initialState,
  reducers: {
    setSelectedBundle: (state, action: PayloadAction<string | null>) => {
      state.selectedBundleId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadBundlesForRegion.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadBundlesForRegion.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.bundles = action.payload;
      })
      .addCase(loadBundlesForRegion.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load bundles';
        state.bundles = [];
      });
  },
});

export const { setSelectedBundle } = bundleSlice.actions;

export default bundleSlice.reducer;
