import { Preferences } from '@capacitor/preferences';
import { isNative } from './native';

const KEY = 'remindue_refresh_token';

export async function saveNativeRefreshToken(token: string): Promise<void> {
  if (!isNative) return;
  await Preferences.set({ key: KEY, value: token });
}

export async function loadNativeRefreshToken(): Promise<string | null> {
  if (!isNative) return null;
  const { value } = await Preferences.get({ key: KEY });
  return value;
}

export async function clearNativeRefreshToken(): Promise<void> {
  if (!isNative) return;
  await Preferences.remove({ key: KEY });
}
