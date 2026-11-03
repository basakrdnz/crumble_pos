import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Push notifications (2026-11-03). The phone registers its Expo push token
 * with set_push_token(); the database sends gün açıldı, gün sonu, ortalama
 * üstü and ay rekoru (supabase/migrations/20261103000011_push_notifications.sql).
 */
const NOTIFY_KEY = 'crumble.notifications';

export const pushSupported = Platform.OS === 'ios' || Platform.OS === 'android';

if (pushSupported) {
  // Show the banner also while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function pushPreference(): Promise<boolean> {
  return (await AsyncStorage.getItem(NOTIFY_KEY)) !== '0';
}

async function pushToken(ask: boolean): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  let granted = permission.granted;
  if (!granted && ask && permission.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Turns pushes on or off for this phone; returns the resulting state. */
export async function setPush(enabled: boolean): Promise<{ enabled: boolean; error?: string }> {
  if (!pushSupported) return { enabled: false, error: 'Bildirimler sadece telefonda çalışır.' };
  try {
    const token = await pushToken(enabled);
    if (!token) {
      if (!enabled) {
        await AsyncStorage.setItem(NOTIFY_KEY, '0');
        return { enabled: false };
      }
      return { enabled: false, error: 'Bildirim izni yok. iPhone Ayarlar → Crumble Yönetim → Bildirimler’den açabilirsin.' };
    }
    const { error } = await supabase.rpc('set_push_token', { p_token: token, p_enabled: enabled });
    if (error) throw new Error(error.message);
    await AsyncStorage.setItem(NOTIFY_KEY, enabled ? '1' : '0');
    return { enabled };
  } catch (e) {
    return { enabled: !enabled, error: `Bildirim ayarlanamadı: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** After sign-in: on by default (iOS asks once); the token is refreshed each time. */
export async function syncPushAfterSignIn(): Promise<void> {
  if (!pushSupported || !(await pushPreference())) return;
  await setPush(true);
}

/** Before sign-out, so a signed-out phone gets nothing. Keeps the preference. */
export async function mutePushForSignOut(): Promise<void> {
  if (!pushSupported) return;
  try {
    const token = await pushToken(false);
    if (token) await supabase.rpc('set_push_token', { p_token: token, p_enabled: false });
  } catch {
    // Signing out must not fail because of this.
  }
}
