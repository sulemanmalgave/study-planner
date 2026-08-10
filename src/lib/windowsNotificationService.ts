// Windows UserNotificationListener Service & Native Bridge Interface
// Uses WinRT / Windows App SDK UserNotificationListener API when running in packaged Windows app shell

export interface WindowsAppIdentity {
  id: string;
  name: string;
  packageFamilyName: string;
  appUserModelId: string;
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
  private listener: any = null;
  private isMonitoring = false;
  private activeSubscription: any = null;

  constructor() {
    this.initWinRTListener();
  }

  private initWinRTListener() {
    try {
      if (
        typeof window !== 'undefined' &&
        (window as any).Windows?.UI?.Notifications?.Management?.UserNotificationListener
      ) {
        this.listener = (window as any).Windows.UI.Notifications.Management.UserNotificationListener.current;
      } else if (typeof window !== 'undefined' && (window as any).chrome?.webview?.hostObjects?.windowsNotificationListener) {
        this.listener = (window as any).chrome.webview.hostObjects.windowsNotificationListener;
      }
    } catch (e) {
      console.warn('WinRT UserNotificationListener not directly bound in current runtime context:', e);
      this.listener = null;
    }
  }

  public isSupported(): boolean {
    return !!this.listener || typeof (window as any)?.Windows?.UI?.Notifications?.Management?.UserNotificationListener !== 'undefined';
  }

  public async getPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    try {
      if (this.listener && typeof this.listener.getAccessStatus === 'function') {
        const status = await this.listener.getAccessStatus();
        // WinRT UserNotificationListenerAccessStatus: 0 = Allowed, 1 = Denied, 2 = Unspecified
        if (status === 0 || status === 'Allowed') return 'granted';
        if (status === 1 || status === 'Denied') return 'denied';
        return 'prompt';
      }
    } catch (e) {
      console.error('Error checking Windows UserNotificationListener access status:', e);
    }
    return 'prompt';
  }

  public async requestAccess(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      if (this.listener && typeof this.listener.requestAccessAsync === 'function') {
        const result = await this.listener.requestAccessAsync();
        if (result === 0 || result === 'Allowed' || result?.status === 0) {
          return true;
        }
      }
    } catch (e) {
      console.error('Error requesting Windows UserNotificationListener access:', e);
    }
    return false;
  }

  public startFocusSuppression(selectedAppNames: string[]) {
    if (!this.isSupported() || !this.listener) return;

    this.isMonitoring = true;
    const selectedIdentifiers = new Set<string>();

    selectedAppNames.forEach((appName) => {
      const ids = WINDOWS_APP_IDENTIFIERS[appName];
      if (ids) {
        ids.forEach((id) => selectedIdentifiers.add(id.toLowerCase()));
      }
      selectedIdentifiers.add(appName.toLowerCase());
    });

    const processActiveNotifications = async () => {
      if (!this.isMonitoring) return;
      try {
        if (typeof this.listener.getNotificationsAsync === 'function') {
          // WinRT NotificationKinds: 1 = Toast
          const notifications = await this.listener.getNotificationsAsync(1);
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

              if (shouldSuppress && typeof this.listener.removeNotification === 'function') {
                // Selectively remove ONLY the matching notification by ID (NEVER ClearNotifications)
                this.listener.removeNotification(notif.id);
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
    if (typeof this.listener.addEventListener === 'function') {
      this.activeSubscription = () => processActiveNotifications();
      this.listener.addEventListener('notificationchanged', this.activeSubscription);
    } else {
      this.activeSubscription = setInterval(processActiveNotifications, 2000);
    }
  }

  public stopFocusSuppression() {
    this.isMonitoring = false;
    if (this.activeSubscription) {
      if (typeof this.activeSubscription === 'number') {
        clearInterval(this.activeSubscription);
      } else if (this.listener && typeof this.listener.removeEventListener === 'function') {
        this.listener.removeEventListener('notificationchanged', this.activeSubscription);
      }
      this.activeSubscription = null;
    }
  }
}

export const windowsNotificationService = new WindowsNotificationManager();
