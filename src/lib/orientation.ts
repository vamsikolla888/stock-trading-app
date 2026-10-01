/**
 * Screen-orientation locks for full-screen views (the advanced chart), loaded lazily: the native
 * module only exists in a binary built after it was added, and a dev client from before must keep
 * working — there, these quietly do nothing and the user can still turn the phone themselves
 * (the app allows both orientations).
 */

type OrientationModule = typeof import('expo-screen-orientation');

let loaded: Promise<OrientationModule | null> | null = null;

function load(): Promise<OrientationModule | null> {
  loaded ??= import('expo-screen-orientation').catch(() => null);
  return loaded;
}

/** Turns the screen to landscape (either way round, following the sensor). */
export async function lockLandscape(): Promise<void> {
  try {
    const module = await load();
    await module?.lockAsync(module.OrientationLock.LANDSCAPE);
  } catch {
    // Unsupported here (an iPad in split view ignores locks): stay as the user holds it.
  }
}

/** Back to the app's normal behaviour — whichever way the phone is held. */
export async function unlockOrientation(): Promise<void> {
  try {
    const module = await load();
    await module?.unlockAsync();
  } catch {
    // Nothing was locked.
  }
}
