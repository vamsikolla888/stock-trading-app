import { AVATAR_MAX_BYTES, AVATAR_TYPES } from './account';

export type PickAvatarResult =
  | { kind: 'picked'; image: Blob }
  | { kind: 'cancelled' }
  /** This build has no image picker (an older dev client) — an update is needed. */
  | { kind: 'unavailable' }
  | { kind: 'invalid'; message: string };

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function typeOf(mimeType: string | null | undefined, uri: string): string | null {
  if (mimeType) return mimeType.toLowerCase();
  const extension = /\.([a-z0-9]+)(?:\?|$)/i.exec(uri)?.[1]?.toLowerCase();
  return extension ? (EXTENSION_TYPES[extension] ?? null) : null;
}

/**
 * Lets the person choose a photo and crop it square, then reads it for upload. The picker is
 * loaded on demand: it is a native module, and a build that predates it must degrade to a
 * message rather than crash the profile screen. The system photo picker needs no permission
 * prompt on current iOS and Android.
 */
export async function pickAvatarImage(): Promise<PickAvatarResult> {
  let picker: typeof import('expo-image-picker');
  try {
    picker = await import('expo-image-picker');
  } catch {
    return { kind: 'unavailable' };
  }

  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    // The server re-encodes to a 512 px WebP; a lighter upload loses nothing that survives that.
    quality: 0.85,
    exif: false,
    // HEIC from an iPhone library is transcoded to JPEG, which the server accepts.
    preferredAssetRepresentationMode:
      picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return { kind: 'cancelled' };

  const type = typeOf(asset.mimeType, asset.uri);
  if (type && !(AVATAR_TYPES as readonly string[]).includes(type)) {
    return { kind: 'invalid', message: 'Choose a JPG, PNG or WebP image.' };
  }
  if (asset.fileSize != null && asset.fileSize > AVATAR_MAX_BYTES) {
    return { kind: 'invalid', message: 'Choose an image smaller than 5 MB.' };
  }

  // A local file read, not a network request — React Native's fetch handles file:// URIs.
  const image = await (await fetch(asset.uri)).blob();
  if (image.size > AVATAR_MAX_BYTES) {
    return { kind: 'invalid', message: 'Choose an image smaller than 5 MB.' };
  }
  return { kind: 'picked', image };
}
