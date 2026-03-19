/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { MainLayout } from './components/layout/MainLayout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { Channels } from './pages/Channels';
import { Skills } from './pages/Skills';
import { Cron } from './pages/Cron';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { useSettingsStore } from './stores/settings';
import { useGatewayStore } from './stores/gateway';
import { io } from 'socket.io-client';
import { WS_URL, appNameForLocale } from './config/app-config';
import { useState } from 'react';
import { X } from 'lucide-react';

// Initialize Socket.io connection
const socket = io(WS_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true
});


/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#f87171',
          background: '#0f172a',
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Something went wrong</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: '#1e293b',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const initSettings = useSettingsStore((state) => state.init);
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const initGateway = useGatewayStore((state) => state.init);

  // Ad State
  const [showAd, setShowAd] = useState(false);
  const [adData, setAdData] = useState<any>(null);

  useEffect(() => {
    // Check for ad on initial load
    const checkAd = async () => {
      try {
        const response = await fetch(`${WS_URL}/api/ad/config?client_type=software`);
        if (response.ok) {
          const data = await response.json();
          let picked: any = null;
          // API may return a dict of positions or a single ad object
          if (data && typeof data === 'object') {
            if ('image_url' in data || 'target_url' in data) {
              picked = data;
            } else if (data.software && typeof data.software === 'object') {
              picked = data.software;
            }
          }
          // Only show when we have a valid, non-empty image and target
          if (picked && picked.image_url && picked.target_url) {
            setAdData(picked);
            setShowAd(true);
          } else {
            setAdData(null);
            setShowAd(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch ad:', error);
      }
    };
    
    // Only check once on mount (or if logic needs to be on every 'home' visit, check location)
    // "首次进入主页面的时候" -> usually means app startup.
    checkAd();
  }, []);

  const handleAdClick = async () => {
    if (!adData) return;
    
    // Log click
    try {
      await fetch(`${WS_URL}/api/ad/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: adData.id })
      });
    } catch (e) {
      console.error(e);
    }
    
    // Open external link
    // Electron usually handles target="_blank" by opening external browser if configured, 
    // or we might need window.electron.openExternal(url) if available.
    // Assuming standard web behavior for now, or that window.open works.
    window.open(adData.target_url, '_blank');
  };

  useEffect(() => {
    // Socket event listeners
    socket.on('connect', () => {
      console.log(`Connected to ${appNameForLocale(language || i18n.language)} Server:`, socket.id);
    });

    socket.on('disconnect', () => {
      console.log(`Disconnected from ${appNameForLocale(language || i18n.language)} Server`);
    });

    socket.on('status', (data) => {
      console.log('Server Status:', data);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('status');
    };
  }, [language]);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  // Sync i18n language with persisted settings on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }

    try {
      const name = appNameForLocale(language || i18n.language);
      document.title = name;
      // best-effort, ignore failures on non-electron environments
      window.electron?.ipcRenderer?.invoke('tray:setTooltip', name).catch(() => {});
    } catch {}
  }, [language]);

  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);

  // Redirect to setup wizard if not complete
  useEffect(() => {
    if (!setupComplete && !location.pathname.startsWith('/setup')) {
      navigate('/setup');
    }
  }, [setupComplete, location.pathname, navigate]);

  // Listen for navigation events from main process
  useEffect(() => {
    const handleNavigate = (...args: unknown[]) => {
      const path = args[0];
      if (typeof path === 'string') {
        navigate(path);
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on('navigate', handleNavigate);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        {/* Ad Modal */}
        {showAd && adData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="relative bg-[#0F172A] border border-white/10 rounded-xl p-4 w-[80%] h-[80%] shadow-2xl flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <button 
                onClick={() => setShowAd(false)} 
                className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div 
                className="cursor-pointer w-full h-full overflow-hidden rounded-lg hover:opacity-95 transition-opacity flex items-center justify-center"
                onClick={handleAdClick}
              >
                <img 
                  src={adData.image_url} 
                  alt="Advertisement" 
                  className="w-full h-full object-contain"
                />
              </div>
              
              <p className="text-xs text-gray-500 mt-2 absolute bottom-2">Advertisement</p>
            </div>
          </div>
        )}

        <Routes>
          {/* Setup wizard (shown on first launch) */}
          <Route path="/setup/*" element={<Setup />} />

          {/* Main application routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/settings/*" element={<Settings />} />
          </Route>
        </Routes>

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          style={{ zIndex: 99999 }}
        />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
