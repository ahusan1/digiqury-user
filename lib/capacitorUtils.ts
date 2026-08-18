import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const isIOS = () => Capacitor.getPlatform() === 'ios';

/** Haptic feedback - light tap (button press) */
export const hapticLight = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (_) {}
};

/** Haptic feedback - medium (add to cart, wishlist) */
export const hapticMedium = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (_) {}
};

/** Haptic feedback - success notification (purchase complete) */
export const hapticSuccess = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch (_) {}
};

/** Haptic feedback - error notification */
export const hapticError = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Error });
  } catch (_) {}
};

/** Setup status bar for Android */
export const setupStatusBar = async () => {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Light });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#2874f0' });
    }
  } catch (_) {}
};

/** Hide splash screen */
export const hideSplash = async () => {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (_) {}
};
