/**
 * Settings State Store
 * Manages application settings
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';
import { normalizeEasyClawAvatarUrl } from '@/lib/easyclaw';

type Theme = 'light' | 'dark' | 'system';
type UpdateChannel = 'stable' | 'beta' | 'dev';

interface SettingsState {
  // General
  theme: Theme;
  language: string;
  startMinimized: boolean;
  launchAtStartup: boolean;

  // Gateway
  gatewayAutoStart: boolean;
  gatewayPort: number;
  proxyEnabled: boolean;
  proxyServer: string;
  proxyHttpServer: string;
  proxyHttpsServer: string;
  proxyAllServer: string;
  proxyBypassRules: string;

  // Update
  updateChannel: UpdateChannel;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;

  // UI State
  sidebarCollapsed: boolean;
  devModeUnlocked: boolean;
  easyClawUserAccount: string;
  easyClawUserName: string;
  easyClawUserAvatar: string;

  // Setup
  setupComplete: boolean;

  // Actions
  init: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: string) => void;
  setStartMinimized: (value: boolean) => void;
  setLaunchAtStartup: (value: boolean) => void;
  setGatewayAutoStart: (value: boolean) => void;
  setGatewayPort: (port: number) => void;
  setProxyEnabled: (value: boolean) => void;
  setProxyServer: (value: string) => void;
  setProxyHttpServer: (value: string) => void;
  setProxyHttpsServer: (value: string) => void;
  setProxyAllServer: (value: string) => void;
  setProxyBypassRules: (value: string) => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  setAutoCheckUpdate: (value: boolean) => void;
  setAutoDownloadUpdate: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  setDevModeUnlocked: (value: boolean) => void;
  setEasyClawBinding: (payload: { account?: string; name?: string; avatar?: string }) => void;
  clearEasyClawBinding: () => void;
  markSetupComplete: () => void;
  resetSettings: () => void;
}

const defaultSettings = {
  theme: 'system' as Theme,
  language: (() => {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('ja')) return 'ja';
    return 'en';
  })(),
  startMinimized: false,
  launchAtStartup: false,
  gatewayAutoStart: true,
  gatewayPort: 18789,
  proxyEnabled: false,
  proxyServer: '',
  proxyHttpServer: '',
  proxyHttpsServer: '',
  proxyAllServer: '',
  proxyBypassRules: '<local>;localhost;127.0.0.1;::1',
  updateChannel: 'stable' as UpdateChannel,
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  sidebarCollapsed: false,
  devModeUnlocked: false,
  easyClawUserAccount: '',
  easyClawUserName: '',
  easyClawUserAvatar: '',
  setupComplete: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      init: async () => {
        try {
          const settings = await window.electron.ipcRenderer.invoke('settings:getAll') as Partial<typeof defaultSettings>;
          const normalizedAvatar = normalizeEasyClawAvatarUrl(settings.easyClawUserAvatar);
          const normalizedSettings = {
            ...settings,
            easyClawUserAvatar: normalizedAvatar,
          };
          set((state) => ({ ...state, ...normalizedSettings }));
          if (settings.language) {
            i18n.changeLanguage(settings.language);
          }
          if (settings.easyClawUserAvatar !== undefined && normalizedAvatar !== settings.easyClawUserAvatar) {
            void window.electron.ipcRenderer.invoke('settings:set', 'easyClawUserAvatar', normalizedAvatar).catch(() => {});
          }
        } catch {
          // Keep renderer-persisted settings as a fallback when the main
          // process store is not reachable.
        }
      },

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => { i18n.changeLanguage(language); set({ language }); void window.electron.ipcRenderer.invoke('settings:set', 'language', language).catch(() => {}); },
      setStartMinimized: (startMinimized) => set({ startMinimized }),
      setLaunchAtStartup: (launchAtStartup) => set({ launchAtStartup }),
      setGatewayAutoStart: (gatewayAutoStart) => { set({ gatewayAutoStart }); void window.electron.ipcRenderer.invoke('settings:set', 'gatewayAutoStart', gatewayAutoStart).catch(() => {}); },
      setGatewayPort: (gatewayPort) => { set({ gatewayPort }); void window.electron.ipcRenderer.invoke('settings:set', 'gatewayPort', gatewayPort).catch(() => {}); },
      setProxyEnabled: (proxyEnabled) => set({ proxyEnabled }),
      setProxyServer: (proxyServer) => set({ proxyServer }),
      setProxyHttpServer: (proxyHttpServer) => set({ proxyHttpServer }),
      setProxyHttpsServer: (proxyHttpsServer) => set({ proxyHttpsServer }),
      setProxyAllServer: (proxyAllServer) => set({ proxyAllServer }),
      setProxyBypassRules: (proxyBypassRules) => set({ proxyBypassRules }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
      setAutoCheckUpdate: (autoCheckUpdate) => set({ autoCheckUpdate }),
      setAutoDownloadUpdate: (autoDownloadUpdate) => set({ autoDownloadUpdate }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setDevModeUnlocked: (devModeUnlocked) => set({ devModeUnlocked }),
      setEasyClawBinding: ({ account, name, avatar }) => {
        const normalizedAvatar = normalizeEasyClawAvatarUrl(avatar);
        const patch = {
          easyClawUserAccount: account ?? '',
          easyClawUserName: name ?? '',
          easyClawUserAvatar: normalizedAvatar,
        };
        set(patch);
        void window.electron.ipcRenderer.invoke('settings:setMany', patch).catch(() => {});
      },
      clearEasyClawBinding: () => {
        const patch = {
          easyClawUserAccount: '',
          easyClawUserName: '',
          easyClawUserAvatar: '',
        };
        set(patch);
        void window.electron.ipcRenderer.invoke('settings:setMany', patch).catch(() => {});
      },
      markSetupComplete: () => set({ setupComplete: true }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'clawx-settings',
    }
  )
);
