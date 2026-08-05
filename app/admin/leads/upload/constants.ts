// Keeps a single upload's background geocoding job comfortably inside the
// route's maxDuration (see layout.tsx). Split larger lists into multiple
// uploads rather than raising this without also raising maxDuration.
export const MAX_ROWS = 500;
