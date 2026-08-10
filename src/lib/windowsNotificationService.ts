// Windows UserNotificationListener Service & Native Bridge Interface
// Interoperable with WinRT, WebView2 Host Objects, WinUI/UWP, PWABuilder & Windows App SDK

export interface WindowsAppIdentity {
  id: string;
  name: string;
  packageFamilyName: string;
  appUserModelId: string;
}

export type NotificationAccessStatus = 'allowed' | 'denied' | 'unsupported' | 'unknown' | 'checking';

// Standalone Single Source of Truth Utility for Windows Notification Permission Checking
export async function checkNotificationPermission(): Promise<NotificationAccessStatus> {
  if (typeof window === 'undefined') return 'unsupported';

  const win = window as any;
  const webviewListener =
    win.chrome?.webview?.hostObjects?.windowsNotificationListener ||
    win.chrome?.webview?.hostObjects?.sync?.windowsNotificationListener;
  const winrtListener = win.Windows?.UI?.Notifications?.Management?.UserNotificationListener;
  const customBridge =
    win.windowsNotificationBridge ||
    win.WindowsNotificationBridge ||
    win.windowsNotification ||
    win.WindowsNotification;

  const bridge = webviewListener || winrtListener || customBridge;

  if (!bridge) {
    return 'unsupported';
  }

  try {
    if (typeof bridge.checkNotificationAccess === 'function') {
      const res = await bridge.checkNotificationAccess();
      if (res === 'allowed' || res === 'granted' || res === 0) return 'allowed';
      if (res === 'denied' || res === 1) return 'denied';
      if (res === 'checking') return 'checking';
    }

    if (typeof bridge.getAccessStatus === 'function') {
      const status = await bridge.getAccessStatus();
      if (status === 0 || status === 'Allowed' || status === 'allowed' || status === 'granted') return 'allowed';
      if (status === 1 || status === 'Denied' || status === 'denied') return 'denied';
      if (status === 'checking') return 'checking';
    }

    if (typeof bridge.getNotificationAccessStatus === 'function') {
      const status = await bridge.getNotificationAccessStatus();
      if (status === 'allowed' || status === 'granted') return 'allowed';
      if (status === 'denied') return 'denied';
      if (status === 'checking') return 'checking';
    }
  } catch (e) {
    console.error('Error in checkNotificationPermission:', e);
  }

  return 'unsupported';
}

// Known Windows Package Identities for Distraction Apps
export const WINDOWS_APP_IDENTIFIERS: Record<string, string[]> = {
  Instagram: ['Facebook.InstagramBeta', 'Instagram', 'Instagram.Instagram'],
  Facebook: ['Facebook.Facebook', 'Facebook', 'Facebook.FacebookTouch'],
  Snapchat: ['Snapchat.Snapchat', 'Snapchat'],
  TikTok: ['TikTok.TikTok', 'TikTok'],
  'X / Twitter': ['91533050.X', 'Twitter', '35272370.X'],
  YouTube: ['Google.YouTube', 'YouTube', 'YouTube.PWA'],
  WhatsApp: ['5319275A.WhatsAppDesktop', 'WhatsApp', 'WhatsApp.WhatsApp'],
  Reddit: ['Reddit.Reddit', 'Reddit'],
  Discord: ['Discord.Discord', 'Discord'],
  Netflix: ['4DF9E0F8.Netflix', 'Netflix'],
};

export class WindowsNotificationManager {
  private isMonitoring = false;
  private activeSubscription: any = null;

  // Dynamically resolve the native bridge or WinRT listener on demand
  private getNativeBridge(): any {
    if (typeof window === 'undefined') return null;

    const win = window as any;

    // 1. Direct WinRT projection (UWP / PWABuilder / WinUI packaged app)
    if (win.Windows?.UI?.Notifications?.Management?.UserNotificationListener) {
      try {
        return win.Windows.UI.Notifications.Management.UserNotificationListener.current;
      } catch (e) {
        console.warn('WinRT UserNotificationListener current instance error:', e);
      }
    }

    // 2. WebView2 Host Objects bridge
    if (win.chrome?.webview?.hostObjects?.windowsNotificationListener) {
      return win.chrome.webview.hostObjects.windowsNotificationListener;
    }
    if (win.chrome?.webview?.hostObjects?.sync?.windowsNotificationListener) {
      return win.chrome.webview.hostObjects.sync.windowsNotificationListener;
    }

    // 3. Custom Windows Native App Bridges (Windows App SDK / PWABuilder wrapper)
    if (win.windowsNotificationBridge) return win.windowsNotificationBridge;
    if (win.WindowsNotificationBridge) return win.WindowsNotificationBridge;
    if (win.windowsNotification) return win.windowsNotification;
    if (win.WindowsNotification) return win.WindowsNotification;

    return null;
  }

  public isSupported(): boolean {
    const bridge = this.getNativeBridge();
    if (bridge) return true;

    // Check if WinRT namespace exists even if not instantiated
    if (typeof window !== 'undefined' && (window as any).Windows?.UI?.Notifications?.Management?.UserNotificationListener) {
      return true;
    }

    return false;
  }

  public async getNotificationAccessStatus(): Promise<NotificationAccessStatus> {
    return this.checkNotificationAccess();
  }

  public async checkNotificationAccess(): Promise<NotificationAccessStatus> {
    const status = await checkNotificationPermission();
    if (status === 'allowed') {
      this.persistStatus('allowed');
    } else if (status === 'denied') {
      this.persistStatus('denied');
    } else if (status === 'unsupported') {
      const storedStatus = typeof localStorage !== 'undefined' ? localStorage.getItem('study_planner_win_notif_status') : null;
      if (storedStatus === 'allowed' && this.getNativeBridge()) {
        return 'allowed';
      }
    }
    return status;
  }

  public async requestNotificationAccess(): Promise<NotificationAccessStatus> {
    const bridge = this.getNativeBridge();

    if (!bridge) {
      if (!this.isSupported()) {
        return 'unsupported';
      }
    }

    try {
      if (bridge) {
        if (typeof bridge.requestNotificationAccess === 'function') {
          const res = await bridge.requestNotificationAccess();
          if (res === 'allowed' || res === 'granted' || res === true || res === 0) {
            this.persistStatus('allowed');
            return 'allowed';
          }
          if (res === 'denied' || res === false || res === 1) {
            this.persistStatus('denied');
            return 'denied';
          }
        }

        if (typeof bridge.requestAccessAsync === 'function') {
          const result = await bridge.requestAccessAsync();
          if (result === 0 || result === 'Allowed' || result === 'allowed' || result?.status === 0) {
            this.persistStatus('allowed');
            return 'allowed';
          } else if (result === 1 || result === 'Denied' || result === 'denied') {
            this.persistStatus('denied');
            return 'denied';
          }
        }
      }
    } catch (e) {
      console.error('Error requesting Windows UserNotificationListener access:', e);
    }

    // Re-verify actual status immediately after request call
    return this.checkNotificationAccess();
  }

  private persistStatus(status: NotificationAccessStatus) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('study_planner_win_notif_status', status);
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  public startFocusSuppression(selectedAppNames: string[]) {
    const bridge = this.getNativeBridge();
    if (!bridge) return;

    this.isMonitoring = true;
    const selectedIdentifiers = new Set<string>();

    selectedAppNames.forEach((appName) => {
      const ids = WINDOWS_APP_IDENTIFIERS[appName];
      if (ids) {
        ids.forEach((id) => selectedIdentifiers.add(id.toLowerCase()));
      }
      selectedIdentifiers.add(appName.toLowerCase());
    });

    if (typeof bridge.startFocusSuppression === 'function') {
      try {
        bridge.startFocusSuppression(Array.from(selectedIdentifiers));
        return;
      } catch (e) {
        console.warn('Bridge startFocusSuppression call failed, falling back to direct removal:', e);
      }
    }

    const processActiveNotifications = async () => {
      if (!this.isMonitoring) return;
      try {
        if (typeof bridge.getNotificationsAsync === 'function') {
          // WinRT NotificationKinds: 1 = Toast
          const notifications = await bridge.getNotificationsAsync(1);
          if (notifications && notifications.length) {
            for (let i = 0; i < notifications.length; i++) {
              const notif = notifications[i];
              const appInfo = notif.appInfo || notif.appUserModelId || notif.packageFamilyName;
              const appIdentityStr = (
                appInfo?.displayInfo?.displayName ||
                appInfo?.id ||
                appInfo ||
                ''
              ).toLowerCase();

              // Match app identity safely
              let shouldSuppress = false;
              for (const targetId of selectedIdentifiers) {
                if (appIdentityStr.includes(targetId)) {
                  shouldSuppress = true;
                  break;
                }
              }

              if (shouldSuppress && typeof bridge.removeNotification === 'function') {
                // Selectively remove ONLY the matching notification by ID (NEVER ClearNotifications)
                bridge.removeNotification(notif.id);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error processing Windows notifications:', err);
      }
    };

    // Run initial scan & set event hook / poll interval during session
    processActiveNotifications();
    if (typeof bridge.addEventListener === 'function') {
      this.activeSubscription = () => processActiveNotifications();
      bridge.addEventListener('notificationchanged', this.activeSubscription);
    } else {
      this.activeSubscription = setInterval(processActiveNotifications, 2000);
    }
  }

  public stopFocusSuppression() {
    this.isMonitoring = false;
    const bridge = this.getNativeBridge();

    if (bridge && typeof bridge.stopFocusSuppression === 'function') {
      try {
        bridge.stopFocusSuppression();
      } catch (e) {
        // ignore
      }
    }

    if (this.activeSubscription) {
      if (typeof this.activeSubscription === 'number') {
        clearInterval(this.activeSubscription);
      } else if (bridge && typeof bridge.removeEventListener === 'function') {
        bridge.removeEventListener('notificationchanged', this.activeSubscription);
      }
      this.activeSubscription = null;
    }
  }
}

export const windowsNotificationService = new WindowsNotificationManager();
