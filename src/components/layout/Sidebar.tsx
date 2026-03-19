/**
 * Sidebar Component
 * Navigation sidebar with menu items.
 * No longer fixed - sits inside the flex layout below the title bar.
 */
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Search,
  Radio,
  Puzzle,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Terminal,
  ExternalLink,
  Trash2,
  BookOpen,
  X,
  Mail,
  Heart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { WS_URL } from '@/config/app-config';
import wechatWorkImg from '@/assets/community/wechat-work.png';
import dashangImg from '@/assets/community/dashang.jpg';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  collapsed?: boolean;
  onClick?: () => void;
}

function NavItem({ to, icon, label, badge, collapsed, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground',
          collapsed && 'justify-center px-2'
        )
      }
    >
      {icon}
      {!collapsed && (
        <>
          <span className="flex-1">{label}</span>
          {badge && (
            <Badge variant="secondary" className="ml-auto">
              {badge}
            </Badge>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);
  const devModeUnlocked = useSettingsStore((state) => state.devModeUnlocked);
  const language = useSettingsStore((state) => state.language);
  const { t } = useTranslation('common');

  // Use Case State
  const [showUseCases, setShowUseCases] = useState(false);
  const [useCases, setUseCases] = useState<any[]>([]);
  const [useCaseSearchQuery, setUseCaseSearchQuery] = useState('');

  // Contact Modal State
  const [showContactModal, setShowContactModal] = useState(false);

  // Ad State
  const [sidebarAd, setSidebarAd] = useState<any>(null);

  useEffect(() => {
    // Fetch Use Cases
    if (showUseCases) {
      fetch(`${WS_URL}/api/usecases`)
        .then(res => res.json())
        .then(data => setUseCases(data))
        .catch(err => console.error(err));
    }
  }, [showUseCases]);

  // Fetch Sidebar Ad
  useEffect(() => {
    const fetchAd = async () => {
      try {
        const response = await fetch(`${WS_URL}/api/ad/config?client_type=software_sidebar`);
        if (response.ok) {
          const data = await response.json();
          // The API might return { software_sidebar: { ... } } or just the ad object
          const adData = data.software_sidebar || data;
          if (adData && adData.is_active) {
            setSidebarAd(adData);
          } else {
            setSidebarAd(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch sidebar ad:', error);
      }
    };

    fetchAd();
    // Refresh ad every 5 minutes
    const interval = setInterval(fetchAd, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';

  const mainSessions = sessions.filter((s) => s.key.endsWith(':main'));
  const otherSessions = sessions.filter((s) => !s.key.endsWith(':main'));

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const openDevConsole = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('gateway:getControlUiUrl') as {
        success: boolean;
        url?: string;
        error?: string;
      };
      if (result.success && result.url) {
        window.electron.openExternal(result.url);
      } else {
        console.error('Failed to get Dev Console URL:', result.error);
      }
    } catch (err) {
      console.error('Error opening Dev Console:', err);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // In a real app, you might want to show a toast here
      alert(language === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);

  const navItems = [
    { to: '/cron', icon: <Clock className="h-5 w-5" />, label: t('sidebar.cronTasks') },
    { to: '/skills', icon: <Puzzle className="h-5 w-5" />, label: t('sidebar.skills') },
    { to: '/channels', icon: <Radio className="h-5 w-5" />, label: t('sidebar.channels') },
    { to: '/dashboard', icon: <Home className="h-5 w-5" />, label: t('sidebar.dashboard') },
    { to: '/settings', icon: <Settings className="h-5 w-5" />, label: t('sidebar.settings') },
  ];

  const filteredUseCases = useCases.filter((useCase) => {
    const query = useCaseSearchQuery.trim().toLowerCase();
    if (!query) return true;

    return [useCase.name_zh, useCase.name_en, useCase.desc_zh, useCase.desc_en]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 overflow-hidden flex flex-col p-2 gap-1">
        {/* Chat nav item: acts as "New Chat" button, never highlighted as active */}
        <button
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) newSession();
            navigate('/');
          }}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground text-muted-foreground',
            sidebarCollapsed && 'justify-center px-2',
          )}
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          {!sidebarCollapsed && <span className="flex-1 text-left">{t('sidebar.newChat')}</span>}
        </button>

        {navItems.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            collapsed={sidebarCollapsed}
          />
        ))}

        {/* Session list — below Settings, only when expanded */}
        {!sidebarCollapsed && sessions.length > 0 && (
          <div className="mt-1 overflow-y-auto max-h-72 space-y-0.5">
            {[...mainSessions, ...[...otherSessions].sort((a, b) =>
              (sessionLastActivity[b.key] ?? 0) - (sessionLastActivity[a.key] ?? 0)
            )].map((s) => (
              <div key={s.key} className="group relative flex items-center">
                <button
                  onClick={() => { switchSession(s.key); navigate('/'); }}
                  className={cn(
                    'w-full text-left rounded-md px-3 py-1.5 text-sm truncate transition-colors',
                    !s.key.endsWith(':main') && 'pr-7',
                    'hover:bg-accent hover:text-accent-foreground',
                    isOnChat && currentSessionKey === s.key
                      ? 'bg-accent/60 text-accent-foreground font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  {getSessionLabel(s.key, s.displayName, s.label)}
                </button>
                {!s.key.endsWith(':main') && (
                  <button
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionToDelete({
                        key: s.key,
                        label: getSessionLabel(s.key, s.displayName, s.label),
                      });
                    }}
                    className={cn(
                      'absolute right-1 flex items-center justify-center rounded p-0.5 transition-opacity',
                      'opacity-0 group-hover:opacity-100',
                      'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Sidebar Ad */}
      {!sidebarCollapsed && sidebarAd && (
        <div className="p-2 mt-auto">
          <div 
            className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow group relative"
            onClick={() => {
              window.electron.openExternal(sidebarAd.target_url);
              // Log ad click
              fetch(`${WS_URL}/api/ad/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_id: sidebarAd.id })
              }).catch(console.error);
            }}
          >
            {sidebarAd.image_url && (
              <div className="aspect-video w-full overflow-hidden">
                <img 
                  src={sidebarAd.image_url} 
                  alt={sidebarAd.title || 'Ad'} 
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            )}
            <div className="p-3">
              {sidebarAd.title && <h4 className="font-semibold text-sm mb-1 line-clamp-1">{sidebarAd.title}</h4>}
              {sidebarAd.description && <p className="text-xs text-muted-foreground line-clamp-2">{sidebarAd.description}</p>}
              <div className="mt-2 text-[10px] text-muted-foreground/50 uppercase tracking-wider flex items-center gap-1">
                <span className="bg-muted px-1 rounded">AD</span>
                <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-2 space-y-2">
        {devModeUnlocked && !sidebarCollapsed && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={openDevConsole}
          >
            <Terminal className="h-4 w-4 mr-2" />
            {t('sidebar.devConsole')}
            <ExternalLink className="h-3 w-3 ml-auto" />
          </Button>
        )}

        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            sidebarCollapsed && "justify-center px-2"
          )}
          onClick={() => setShowUseCases(true)}
        >
          <BookOpen className="h-5 w-5 mr-2" />
          {!sidebarCollapsed && <span>{language === 'zh' ? '使用案例' : 'Use Cases'}</span>}
        </Button>

        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            sidebarCollapsed && "justify-center px-2"
          )}
          onClick={() => setShowContactModal(true)}
        >
          <Mail className="h-5 w-5 mr-2" />
          {!sidebarCollapsed && <span>{language === 'zh' ? '联系我们(龙虾学习营)' : 'Contact Us(Learning Camp)'}</span>}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t('common.confirm', 'Confirm')}
        message={sessionToDelete ? t('sidebar.deleteSessionConfirm', `Delete "${sessionToDelete.label}"?`) : ''}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) navigate('/');
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />

      {/* Use Cases Modal */}
      {showUseCases && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex h-[90%] w-[90%] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4">
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                <BookOpen className="h-6 w-6 text-sky-600" />
                {language === 'zh' ? 'OpenClaw 使用案例库' : 'OpenClaw Use Case Library'}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setShowUseCases(false)} className="text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="border-b border-slate-200 bg-white p-4">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={useCaseSearchQuery}
                  onChange={(e) => setUseCaseSearchQuery(e.target.value)}
                  placeholder={language === 'zh' ? '\u641c\u7d22\u4f7f\u7528\u6848\u4f8b' : 'Search use cases'}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredUseCases.map((useCase) => (
                  <div 
                    key={useCase.id} 
                    className="group flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
                    onClick={() => window.electron.openExternal(useCase.url)}
                  >
                    <h3 className="mb-2 text-lg font-semibold text-slate-900 transition-colors group-hover:text-sky-700">
                      {language === 'zh' ? useCase.name_zh : useCase.name_en}
                    </h3>
                    <p className="flex-1 text-sm leading-6 text-slate-600">
                      {language === 'zh' ? useCase.desc_zh : useCase.desc_en}
                    </p>
                    <div className="mt-4 flex items-center border-t border-slate-100 pt-4 text-xs font-medium text-slate-500 transition-colors group-hover:text-sky-700">
                      <ExternalLink className="mr-1 h-3 w-3" />
                      {language === 'zh' ? '查看详情' : 'View Details'}
                    </div>
                  </div>
                ))}
              </div>
              {filteredUseCases.length === 0 && (
                <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                  {language === 'zh' ? '\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u6848\u4f8b' : 'No matching use cases'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-[#0F172A] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl transform transition-all animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
            <button 
              onClick={() => setShowContactModal(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center mb-6">
              <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/5">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-2 text-white">
                {language === 'zh' ? '欢迎加入龙虾学习营' : 'Welcome to Lobster Learning Camp'}
              </h3>
              <p className="text-gray-400">
                {language === 'zh' ? '24小时提供 EasyClaw 远程配置服务' : '24/7 EasyClaw remote configuration service'}
              </p>
            </div>
            
            <div className="space-y-3">
              {/* Email */}
              <div className="bg-[#1E293B]/30 rounded-xl p-4 border border-white/5 flex items-center justify-between gap-4 group hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-white/5 p-2 rounded-lg">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex flex-col text-left">
                      <span className="text-xs text-gray-500">Email</span>
                      <span className="font-mono text-gray-200 truncate select-all">328019437@qq.com</span>
                  </div>
                </div>
                <button 
                  onClick={() => copyToClipboard('328019437@qq.com')} 
                  className="text-xs bg-primary/10 hover:bg-primary hover:text-white text-primary px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  {language === 'zh' ? '复制' : 'Copy'}
                </button>
              </div>

              {/* WeChat */}
              <div className="bg-[#1E293B]/30 rounded-xl p-4 border border-white/5 flex items-center justify-between gap-4 group hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-white/5 p-2 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex flex-col text-left">
                      <span className="text-xs text-gray-500">WeChat</span>
                      <span className="font-mono text-gray-200 truncate select-all">luxixi20010201</span>
                  </div>
                </div>
                <button 
                  onClick={() => copyToClipboard('luxixi20010201')} 
                  className="text-xs bg-primary/10 hover:bg-primary hover:text-white text-primary px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  {language === 'zh' ? '复制' : 'Copy'}
                </button>
              </div>

              {/* WhatsApp */}
              <div className="bg-[#1E293B]/30 rounded-xl p-4 border border-white/5 flex items-center justify-between gap-4 group hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-white/5 p-2 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex flex-col text-left">
                      <span className="text-xs text-gray-500">WhatsApp</span>
                      <span className="font-mono text-gray-200 truncate select-all">+8615065676902</span>
                  </div>
                </div>
                <button 
                  onClick={() => copyToClipboard('+8615065676902')} 
                  className="text-xs bg-primary/10 hover:bg-primary hover:text-white text-primary px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  {language === 'zh' ? '复制' : 'Copy'}
                </button>
              </div>

              {/* WeChat Work */}
              <div className="bg-[#1E293B]/30 rounded-xl p-4 border border-white/5 flex items-center justify-between gap-4 group hover:border-primary/30 transition-colors relative">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-white/5 p-2 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex flex-col text-left">
                      <span className="text-xs text-gray-500">{language === 'zh' ? '企业微信 (悬停扫码)' : 'WeChat Work (Hover to Scan)'}</span>
                      <span className="font-mono text-gray-200 truncate select-all">{language === 'zh' ? 'EasyClaw 官方客服' : 'EasyClaw Official Support'}</span>
                  </div>
                </div>
                
                {/* Hover Image (Fixed Center) */}
                <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[100]">
                   <div className="bg-white p-2 rounded-xl shadow-2xl w-96 border-4 border-primary/20">
                     <img src={wechatWorkImg} alt="WeChat Work QR" className="w-full h-auto rounded-lg" />
                     <div className="text-center text-gray-800 mt-2 font-bold">{language === 'zh' ? 'EasyClaw 客服' : 'EasyClaw Support'}</div>
                   </div>
                </div>
              </div>

              {/* Donation (Dashang) */}
              <div className="bg-[#1E293B]/30 rounded-xl p-4 border border-white/5 flex items-center justify-between gap-4 group hover:border-primary/30 transition-colors relative">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-white/5 p-2 rounded-lg">
                    <Heart className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex flex-col text-left">
                      <span className="text-xs text-gray-500">{language === 'zh' ? '打赏作者 (悬停扫码)' : 'Donate (Hover to Scan)'}</span>
                      <span className="font-mono text-gray-200 truncate select-all">{language === 'zh' ? '感谢支持开源开发' : 'Support Open Source'}</span>
                  </div>
                </div>
                
                {/* Hover Image (Fixed Center) */}
                <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[100]">
                   <div className="bg-white p-4 rounded-xl shadow-2xl w-96 text-center border-4 border-red-500/20">
                     <img src={dashangImg} alt="Donation QR" className="w-full h-auto rounded-lg mb-3" />
                     <div className="text-gray-800 text-xs font-mono break-all bg-gray-100 p-2 rounded border border-gray-200 select-all pointer-events-auto">
                       TDkoPfk7WPjyxFpoP1Ja85bULbkKYh9Cm4
                     </div>
                     <div className="text-gray-500 text-[10px] mt-1">{language === 'zh' ? 'USDT (TRC20) 地址' : 'USDT (TRC20) Address'}</div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
