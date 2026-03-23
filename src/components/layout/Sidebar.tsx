import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  CalendarDays,
  Clock,
  Code2,
  ExternalLink,
  Film,
  Gamepad2,
  Handshake,
  Heart,
  Leaf,
  LineChart,
  Mail,
  MessageSquare,
  Newspaper,
  Plane,
  Puzzle,
  Radio,
  Scale,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeEasyClawAvatarUrl } from '@/lib/easyclaw';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { WS_URL, appNameForLocale } from '@/config/app-config';
import wechatWorkImg from '@/assets/community/wechat-work.png';
import dashangImg from '@/assets/community/dashang.jpg';
import appIconPng from '@/assets/appicon.png';
import { Dashboard } from '@/pages/Dashboard';
import { Channels } from '@/pages/Channels';
import { Skills } from '@/pages/Skills';
import { Cron } from '@/pages/Cron';
import { Settings as SettingsPage } from '@/pages/Settings';

interface UseCaseItem {
  id: number;
  name_zh?: string;
  name_en?: string;
  desc_zh?: string;
  desc_en?: string;
  url: string;
}

interface SidebarAd {
  id: number;
  title?: string;
  description?: string;
  image_url?: string;
  target_url: string;
  is_active?: boolean;
}

type UseCaseCategory =
  | 'all'
  | 'automation'
  | 'content'
  | 'business'
  | 'productivity'
  | 'lifestyle';

type SettingsPanel =
  | 'cron'
  | 'skills'
  | 'channels'
  | 'dashboard'
  | 'settings'
  | 'usecases'
  | 'contact';

const USE_CASE_CATEGORY_META: Array<{ key: UseCaseCategory; zh: string; en: string }> = [
  { key: 'all', zh: '\u5168\u90e8\u7075\u611f', en: 'All Ideas' },
  { key: 'automation', zh: '\u81ea\u52a8\u6d41\u7a0b', en: 'Automation' },
  { key: 'content', zh: '\u5185\u5bb9\u521b\u4f5c', en: 'Content' },
  { key: 'business', zh: '\u5546\u4e1a\u5206\u6790', en: 'Business' },
  { key: 'productivity', zh: '\u6548\u7387\u534f\u4f5c', en: 'Productivity' },
  { key: 'lifestyle', zh: '\u751f\u6d3b\u52a9\u624b', en: 'Lifestyle' },
];

function getUseCaseText(useCase: UseCaseItem, language: string) {
  return {
    name: language === 'zh' ? (useCase.name_zh || useCase.name_en || '') : (useCase.name_en || useCase.name_zh || ''),
    desc: language === 'zh' ? (useCase.desc_zh || useCase.desc_en || '') : (useCase.desc_en || useCase.desc_zh || ''),
  };
}

function inferUseCaseCategory(useCase: UseCaseItem): UseCaseCategory {
  const haystack = [useCase.name_zh, useCase.name_en, useCase.desc_zh, useCase.desc_en, useCase.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(workflow|automation|calendar|meeting|todo|schedule|n8n|server|task|\u81ea\u52a8|\u6d41\u7a0b|\u4f1a\u8bae|\u65e5\u7a0b)/.test(haystack)) {
    return 'automation';
  }
  if (/(youtube|video|podcast|reddit|newsletter|content|\u5185\u5bb9|\u89c6\u9891|\u6458\u8981|\u521b\u4f5c)/.test(haystack)) {
    return 'content';
  }
  if (/(investment|market|crm|customer|legal|issue|github|research|business|\u5546\u4e1a|\u6cd5\u5f8b|\u5ba2\u6237|\u5e02\u573a)/.test(haystack)) {
    return 'business';
  }
  if (/(dashboard|project|review|code|agent|desktop|productivity|\u4ee3\u7801|\u5de5\u4f5c|\u9879\u76ee|\u4eea\u8868\u76d8)/.test(haystack)) {
    return 'productivity';
  }
  if (/(travel|trip|health|habit|family|guest|phone|lifestyle|\u751f\u6d3b|\u65c5\u884c|\u5065\u5eb7|\u4e60\u60ef)/.test(haystack)) {
    return 'lifestyle';
  }
  return 'productivity';
}

function getUseCaseVisual(useCase: UseCaseItem): {
  icon: LucideIcon;
  badgeClass: string;
  heroClass: string;
  chipClass: string;
} {
  const haystack = [useCase.name_zh, useCase.name_en, useCase.desc_zh, useCase.desc_en, useCase.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const visuals: Array<{
    pattern: RegExp;
    icon: LucideIcon;
    badgeClass: string;
    heroClass: string;
    chipClass: string;
  }> = [
    {
      pattern: /(reddit|news|digest|newsletter|\u65b0\u95fb|\u6458\u8981)/,
      icon: Newspaper,
      badgeClass: 'from-orange-100 via-amber-50 to-white',
      heroClass: 'from-orange-100 via-amber-50 to-rose-50',
      chipClass: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    },
    {
      pattern: /(youtube|video|podcast|\u89c6\u9891)/,
      icon: Film,
      badgeClass: 'from-rose-100 via-pink-50 to-white',
      heroClass: 'from-rose-100 via-orange-50 to-white',
      chipClass: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
    },
    {
      pattern: /(travel|trip|\u65c5\u884c)/,
      icon: Plane,
      badgeClass: 'from-sky-100 via-cyan-50 to-white',
      heroClass: 'from-sky-100 via-cyan-50 to-indigo-50',
      chipClass: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
    },
    {
      pattern: /(calendar|meeting|schedule|todo|task|\u65e5\u7a0b|\u4f1a\u8bae|\u4efb\u52a1)/,
      icon: CalendarDays,
      badgeClass: 'from-blue-100 via-indigo-50 to-white',
      heroClass: 'from-blue-100 via-indigo-50 to-white',
      chipClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    },
    {
      pattern: /(workflow|automation|n8n|server|\u81ea\u52a8|\u6d41\u7a0b)/,
      icon: Workflow,
      badgeClass: 'from-yellow-100 via-amber-50 to-white',
      heroClass: 'from-yellow-100 via-amber-50 to-white',
      chipClass: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
    },
    {
      pattern: /(github|code|review|\u4ee3\u7801|\u5ba1\u67e5)/,
      icon: Code2,
      badgeClass: 'from-slate-200 via-slate-50 to-white',
      heroClass: 'from-slate-100 via-white to-slate-50',
      chipClass: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    },
    {
      pattern: /(health|habit|symptom|\u5065\u5eb7|\u4e60\u60ef)/,
      icon: Leaf,
      badgeClass: 'from-emerald-100 via-green-50 to-white',
      heroClass: 'from-emerald-100 via-lime-50 to-white',
      chipClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    },
    {
      pattern: /(investment|market|research|\u6295\u8d44|\u5e02\u573a|\u7814\u7a76)/,
      icon: LineChart,
      badgeClass: 'from-violet-100 via-fuchsia-50 to-white',
      heroClass: 'from-violet-100 via-pink-50 to-white',
      chipClass: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    },
    {
      pattern: /(crm|customer|assistant|support|\u5ba2\u6237|\u52a9\u624b|\u5ba2\u670d)/,
      icon: Handshake,
      badgeClass: 'from-cyan-100 via-sky-50 to-white',
      heroClass: 'from-cyan-100 via-sky-50 to-white',
      chipClass: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
    },
    {
      pattern: /(game|\u6e38\u620f)/,
      icon: Gamepad2,
      badgeClass: 'from-fuchsia-100 via-pink-50 to-white',
      heroClass: 'from-fuchsia-100 via-purple-50 to-white',
      chipClass: 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200',
    },
    {
      pattern: /(legal|contract|\u6cd5\u5f8b|\u5408\u540c)/,
      icon: Scale,
      badgeClass: 'from-stone-200 via-stone-50 to-white',
      heroClass: 'from-stone-100 via-amber-50 to-white',
      chipClass: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
    },
    {
      pattern: /(agent|bot|autonomous|\u673a\u5668\u4eba|\u81ea\u4e3b)/,
      icon: Bot,
      badgeClass: 'from-teal-100 via-cyan-50 to-white',
      heroClass: 'from-teal-100 via-cyan-50 to-white',
      chipClass: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
    },
  ];

  return (
    visuals.find((item) => item.pattern.test(haystack)) ?? {
      icon: Sparkles,
      badgeClass: 'from-slate-100 via-white to-slate-50',
      heroClass: 'from-slate-100 via-white to-slate-50',
      chipClass: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    }
  );
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);
  const devModeUnlocked = useSettingsStore((state) => state.devModeUnlocked);
  const language = useSettingsStore((state) => state.language);
  const easyClawUserAccount = useSettingsStore((state) => state.easyClawUserAccount);
  const easyClawUserName = useSettingsStore((state) => state.easyClawUserName);
  const easyClawUserAvatar = useSettingsStore((state) => state.easyClawUserAvatar);
  const { t } = useTranslation('common');

  const [useCases, setUseCases] = useState<UseCaseItem[]>([]);
  const [useCaseSearchQuery, setUseCaseSearchQuery] = useState('');
  const [useCaseCategory, setUseCaseCategory] = useState<UseCaseCategory>('all');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('settings');
  const [sidebarAd, setSidebarAd] = useState<SidebarAd | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);

  const sessions = useChatStore((state) => state.sessions);
  const currentSessionKey = useChatStore((state) => state.currentSessionKey);
  const sessionLabels = useChatStore((state) => state.sessionLabels);
  const sessionLastActivity = useChatStore((state) => state.sessionLastActivity);
  const switchSession = useChatStore((state) => state.switchSession);
  const newSession = useChatStore((state) => state.newSession);
  const deleteSession = useChatStore((state) => state.deleteSession);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';
  const appName = appNameForLocale(language);

  const mainSessions = sessions.filter((session) => session.key.endsWith(':main'));
  const otherSessions = sessions.filter((session) => !session.key.endsWith(':main'));
  const easyClawDisplayName = language === 'zh' ? '\u9f99\u867eAPP' : 'Lobster APP';
  const sidebarUserName = easyClawUserName || easyClawUserAccount || easyClawDisplayName;
  const sidebarUserSubtext =
    easyClawUserAccount || (language === 'zh' ? '\u70b9\u51fb\u914d\u7f6e\u9f99\u867e\u9891\u9053' : 'Configure Lobster channel');
  const normalizedEasyClawUserAvatar = normalizeEasyClawAvatarUrl(easyClawUserAvatar);
  const hasBoundEasyClaw = Boolean(easyClawUserAccount || easyClawUserName || normalizedEasyClawUserAvatar);

  const settingsItems = [
    { key: 'cron', icon: <Clock className="h-4 w-4" />, label: t('sidebar.cronTasks') },
    { key: 'skills', icon: <Puzzle className="h-4 w-4" />, label: t('sidebar.skills') },
    { key: 'channels', icon: <Radio className="h-4 w-4" />, label: t('sidebar.channels') },
    { key: 'dashboard', icon: <Heart className="h-4 w-4" />, label: t('sidebar.dashboard') },
    {
      key: 'settings',
      icon: <Settings className="h-4 w-4" />,
      label: language === 'zh' ? '\u5176\u4ed6\u8bbe\u7f6e' : 'Other Settings',
    },
  ] as const;

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  useEffect(() => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  }, [sidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    if (!showSettingsModal || settingsPanel !== 'usecases') {
      return;
    }

    fetch(`${WS_URL}/api/usecases`)
      .then((response) => response.json())
      .then((data) => setUseCases(Array.isArray(data) ? data : []))
      .catch((error) => console.error('Failed to load use cases:', error));
  }, [showSettingsModal, settingsPanel]);

  useEffect(() => {
    const fetchAd = async () => {
      try {
        const response = await fetch(`${WS_URL}/api/ad/config?client_type=software_sidebar`);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const adData = data.software_sidebar || data;
        setSidebarAd(adData && adData.is_active ? adData : null);
      } catch (error) {
        console.error('Failed to fetch sidebar ad:', error);
      }
    };

    fetchAd();
    const interval = setInterval(fetchAd, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const openDevConsole = async () => {
    try {
      const result = (await window.electron.ipcRenderer.invoke('gateway:getControlUiUrl')) as {
        success: boolean;
        url?: string;
        error?: string;
      };
      if (result.success && result.url) {
        window.electron.openExternal(result.url);
      } else {
        console.error('Failed to get Dev Console URL:', result.error);
      }
    } catch (error) {
      console.error('Error opening Dev Console:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(language === 'zh' ? '\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f' : 'Copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const openSettingsModal = () => {
    setSettingsPanel('settings');
    setShowSettingsModal(true);
  };

  const openQuickPanel = (panel: SettingsPanel) => {
    setSettingsPanel(panel);
    setShowSettingsModal(true);
  };

  const openEasyClawChannelConfig = () => {
    navigate('/channels', { state: { openChannelType: 'easyclaw' } });
  };

  const filteredUseCases = useCases.filter((useCase) => {
    const query = useCaseSearchQuery.trim().toLowerCase();
    const text = [useCase.name_zh, useCase.name_en, useCase.desc_zh, useCase.desc_en]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesCategory = useCaseCategory === 'all' || inferUseCaseCategory(useCase) === useCaseCategory;
    const matchesSearch = !query || text.includes(query);
    return matchesCategory && matchesSearch;
  });
  const featuredUseCases = filteredUseCases.slice(0, 2);
  const regularUseCases = filteredUseCases.slice(featuredUseCases.length);

  const renderUseCasesPanel = () => (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-[#F8FAFC]">
      <div className="border-b border-slate-200/80 bg-white px-8 py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
              <Sparkles className="h-3.5 w-3.5" />
              {language === 'zh' ? '\u63a8\u8350\u573a\u666f' : 'Featured Ideas'}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {language === 'zh' ? '\u7075\u611f\u5e7f\u573a' : 'Idea Gallery'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {language === 'zh'
                ? '\u4ece\u771f\u5b9e\u573a\u666f\u91cc\u6311\u9009\u4f60\u8981\u7684\u80fd\u529b\uff0c\u70b9\u51fb\u5361\u7247\u53ef\u76f4\u63a5\u6253\u5f00\u8be6\u60c5\u9875\u3002'
                : 'Browse real scenarios and open any case directly for details.'}
            </p>
          </div>

          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={useCaseSearchQuery}
              onChange={(event) => setUseCaseSearchQuery(event.target.value)}
              placeholder={language === 'zh' ? '\u641c\u7d22\u4f7f\u7528\u6848\u4f8b' : 'Search use cases'}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-7">
        <div className="mb-7 flex flex-wrap gap-2">
          {USE_CASE_CATEGORY_META.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setUseCaseCategory(item.key)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-all',
                useCaseCategory === item.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900',
              )}
            >
              {language === 'zh' ? item.zh : item.en}
            </button>
          ))}
        </div>

        {featuredUseCases.length > 0 && (
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {language === 'zh' ? '\u4eca\u65e5\u63a8\u8350' : 'Today Picks'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {language === 'zh'
                    ? '\u9002\u5408\u5feb\u901f\u4e0a\u624b\u7684\u4e24\u4e2a\u9ad8\u9891\u573a\u666f'
                    : 'Two quick ideas to get started'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {featuredUseCases.map((useCase) => {
                const text = getUseCaseText(useCase, language);
                const visual = getUseCaseVisual(useCase);
                const Icon = visual.icon;
                const category = USE_CASE_CATEGORY_META.find((item) => item.key === inferUseCaseCategory(useCase));

                return (
                  <button
                    key={useCase.id}
                    type="button"
                    onClick={() => window.electron.openExternal(useCase.url)}
                    className={cn(
                      'group relative overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
                      visual.heroClass,
                    )}
                  >
                    <div className="mb-10 flex items-start justify-between gap-4">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/85 shadow-sm ring-1 ring-white/80">
                        <Icon className="h-7 w-7 text-slate-800" />
                      </div>
                      <span className={cn('rounded-full px-3 py-1 text-xs font-medium', visual.chipClass)}>
                        {language === 'zh' ? category?.zh : category?.en}
                      </span>
                    </div>

                    <div className="max-w-md">
                      <h4 className="text-2xl font-semibold tracking-tight text-slate-900">{text.name}</h4>
                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">{text.desc}</p>
                    </div>

                    <div className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-900">
                      <span>{language === 'zh' ? '\u67e5\u770b\u6848\u4f8b' : 'Open case'}</span>
                      <ExternalLink className="h-4 w-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {regularUseCases.length > 0 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {language === 'zh' ? '\u5168\u90e8\u6848\u4f8b' : 'All Cases'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {language === 'zh'
                    ? '\u6bcf\u4e2a\u6848\u4f8b\u90fd\u53ef\u4ee5\u76f4\u63a5\u8df3\u8f6c\u5230\u5b98\u7f51\u8be6\u60c5'
                    : 'Each card opens the official case page'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {regularUseCases.map((useCase) => {
                const text = getUseCaseText(useCase, language);
                const visual = getUseCaseVisual(useCase);
                const Icon = visual.icon;
                const category = USE_CASE_CATEGORY_META.find((item) => item.key === inferUseCaseCategory(useCase));

                return (
                  <button
                    key={useCase.id}
                    type="button"
                    onClick={() => window.electron.openExternal(useCase.url)}
                    className="group flex h-full flex-col rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div
                        className={cn(
                          'inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ring-1 ring-white',
                          visual.badgeClass,
                        )}
                      >
                        <Icon className="h-5 w-5 text-slate-800" />
                      </div>
                      <span className={cn('rounded-full px-3 py-1 text-[11px] font-medium', visual.chipClass)}>
                        {language === 'zh' ? category?.zh : category?.en}
                      </span>
                    </div>

                    <h4 className="text-lg font-semibold leading-7 text-slate-900 transition-colors group-hover:text-slate-700">
                      {text.name}
                    </h4>
                    <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{text.desc}</p>

                    <div className="mt-5 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-medium text-slate-500 transition-colors group-hover:text-slate-800">
                      <span>{language === 'zh' ? '\u67e5\u770b\u8be6\u60c5' : 'View details'}</span>
                      <ExternalLink className="h-4 w-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredUseCases.length === 0 && (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Search className="h-6 w-6 text-slate-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {language === 'zh' ? '\u6ca1\u6709\u627e\u5230\u5bf9\u5e94\u6848\u4f8b' : 'No matching use cases'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {language === 'zh'
                ? '\u53ef\u4ee5\u6362\u4e2a\u5173\u952e\u8bcd\uff0c\u6216\u5207\u6362\u4e0a\u65b9\u7684\u5206\u7c7b\u8bd5\u8bd5'
                : 'Try a different keyword or category'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderContactPanel = () => (
    <div className="h-full overflow-auto rounded-[28px] bg-[#0F172A] p-8 text-white">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-lg shadow-primary/5">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-3xl font-bold">
            {language === 'zh' ? '\u6b22\u8fce\u52a0\u5165\u9f99\u867e\u5b66\u4e60\u8425' : 'Welcome to Lobster Learning Camp'}
          </h3>
          <p className="text-gray-400">
            {language === 'zh'
              ? `24\u5c0f\u65f6\u63d0\u4f9b ${appName} \u8fdc\u7a0b\u914d\u7f6e\u670d\u52a1`
              : `24/7 ${appName} remote configuration service`}
          </p>
        </div>

        <div className="space-y-3">
          <div className="group flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#1E293B]/30 p-4 transition-colors hover:border-primary/30">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="rounded-lg bg-white/5 p-2">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs text-gray-500">Email</span>
                <span className="font-mono text-gray-200">328019437@qq.com</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard('328019437@qq.com')}
              className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
            >
              {language === 'zh' ? '\u590d\u5236' : 'Copy'}
            </button>
          </div>
          <div className="group flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#1E293B]/30 p-4 transition-colors hover:border-primary/30">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="rounded-lg bg-white/5 p-2">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs text-gray-500">WeChat</span>
                <span className="font-mono text-gray-200">luxixi20010201</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard('luxixi20010201')}
              className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
            >
              {language === 'zh' ? '\u590d\u5236' : 'Copy'}
            </button>
          </div>

          <div className="group flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-[#1E293B]/30 p-4 transition-colors hover:border-primary/30">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="rounded-lg bg-white/5 p-2">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs text-gray-500">WhatsApp</span>
                <span className="font-mono text-gray-200">+8615065676902</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard('+8615065676902')}
              className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
            >
              {language === 'zh' ? '\u590d\u5236' : 'Copy'}
            </button>
          </div>

          <div className="group relative rounded-xl border border-white/5 bg-[#1E293B]/30 p-4 transition-colors hover:border-primary/30">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="rounded-lg bg-white/5 p-2">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs text-gray-500">
                  {language === 'zh' ? '\u4f01\u4e1a\u5fae\u4fe1\uff08\u60ac\u505c\u626b\u7801\uff09' : 'WeChat Work (Hover to Scan)'}
                </span>
                <span className="font-mono text-gray-200">
                  {language === 'zh' ? `${appName} \u5b98\u65b9\u5ba2\u670d` : `${appName} Official Support`}
                </span>
              </div>
            </div>
            <div className="pointer-events-none fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="w-96 rounded-xl border-4 border-primary/20 bg-white p-2 shadow-2xl">
                <img src={wechatWorkImg} alt="WeChat Work QR" className="w-full rounded-lg" />
                <div className="mt-2 text-center font-bold text-gray-800">
                  {language === 'zh' ? `${appName} \u5ba2\u670d` : `${appName} Support`}
                </div>
              </div>
            </div>
          </div>

          <div className="group relative rounded-xl border border-white/5 bg-[#1E293B]/30 p-4 transition-colors hover:border-primary/30">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="rounded-lg bg-white/5 p-2">
                <Heart className="h-5 w-5 text-red-500" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs text-gray-500">
                  {language === 'zh' ? '\u6253\u8d4f\u4f5c\u8005\uff08\u60ac\u505c\u626b\u7801\uff09' : 'Donate (Hover to Scan)'}
                </span>
                <span className="font-mono text-gray-200">
                  {language === 'zh' ? '\u611f\u8c22\u652f\u6301\u5f00\u6e90\u5f00\u53d1' : 'Support Open Source'}
                </span>
              </div>
            </div>
            <div className="pointer-events-none fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="w-96 rounded-xl border-4 border-red-500/20 bg-white p-4 text-center shadow-2xl">
                <img src={dashangImg} alt="Donation QR" className="mb-3 w-full rounded-lg" />
                <div className="break-all rounded border border-gray-200 bg-gray-100 p-2 font-mono text-xs text-gray-800">
                  TDkoPfk7WPjyxFpoP1Ja85bULbkKYh9Cm4
                </div>
                <div className="mt-1 text-[10px] text-gray-500">USDT (TRC20) Address</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettingsPanel = () => {
    switch (settingsPanel) {
      case 'cron':
        return <Cron />;
      case 'skills':
        return <Skills />;
      case 'channels':
        return <Channels />;
      case 'dashboard':
        return <Dashboard />;
      case 'usecases':
        return renderUseCasesPanel();
      case 'contact':
        return renderContactPanel();
      case 'settings':
      default:
        return <SettingsPage />;
    }
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-background transition-all duration-300">
      <nav className="flex flex-1 flex-col gap-1 overflow-hidden p-2">
        <button
          type="button"
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) {
              newSession();
            }
            navigate('/');
          }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-left">{t('sidebar.newChat')}</span>
        </button>

        {sessions.length > 0 && (
          <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
            {[
              ...mainSessions,
              ...[...otherSessions].sort(
                (left, right) => (sessionLastActivity[right.key] ?? 0) - (sessionLastActivity[left.key] ?? 0),
              ),
            ].map((session) => (
              <div key={session.key} className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    switchSession(session.key);
                    navigate('/');
                  }}
                  className={cn(
                    'w-full truncate rounded-md px-3 py-1.5 pr-7 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                    isOnChat && currentSessionKey === session.key
                      ? 'bg-accent/60 font-medium text-accent-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {getSessionLabel(session.key, session.displayName, session.label)}
                </button>
                {!session.key.endsWith(':main') && (
                  <button
                    type="button"
                    aria-label="Delete session"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSessionToDelete({
                        key: session.key,
                        label: getSessionLabel(session.key, session.displayName, session.label),
                      });
                    }}
                    className="absolute right-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </nav>

      {!sidebarAd && <div className="mt-auto" />}
      {sidebarAd && (
        <div className="p-2">
          <div
            className="group relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md"
            onClick={() => {
              window.electron.openExternal(sidebarAd.target_url);
              fetch(`${WS_URL}/api/ad/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_id: sidebarAd.id }),
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
              {sidebarAd.title && <h4 className="mb-1 line-clamp-1 text-sm font-semibold">{sidebarAd.title}</h4>}
              {sidebarAd.description && <p className="line-clamp-2 text-xs text-muted-foreground">{sidebarAd.description}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="p-2">
        {devModeUnlocked && (
          <Button variant="ghost" size="sm" className="mb-2 w-full justify-start" onClick={openDevConsole}>
            <Terminal className="mr-2 h-4 w-4" />
            {t('sidebar.devConsole')}
            <ExternalLink className="ml-auto h-3 w-3" />
          </Button>
        )}

        <div className="mb-2 space-y-2">
          <button
            type="button"
            onClick={() => openQuickPanel('usecases')}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{language === 'zh' ? '\u4f7f\u7528\u6848\u4f8b' : 'Use Cases'}</div>
              <div className="mt-0.5 text-xs text-slate-500">{language === 'zh' ? '\u573a\u666f\u7075\u611f' : 'Ideas'}</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openQuickPanel('cron')}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
          >
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{t('sidebar.cronTasks')}</div>
              <div className="mt-0.5 text-xs text-slate-500">{language === 'zh' ? '\u5feb\u901f\u6253\u5f00' : 'Quick access'}</div>
            </div>
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
              <img
                src={normalizedEasyClawUserAvatar || appIconPng}
                alt={sidebarUserName}
                className={cn('h-full w-full object-cover', !hasBoundEasyClaw && 'object-cover')}
              />
            </div>

            <button type="button" onClick={openEasyClawChannelConfig} className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-semibold text-slate-900">{sidebarUserName}</div>
              <div className="truncate text-xs text-slate-500">{sidebarUserSubtext}</div>
            </button>

            <Button
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              onClick={openSettingsModal}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t('common.confirm', 'Confirm')}
        message={sessionToDelete ? t('sidebar.deleteSessionConfirm', `Delete "${sessionToDelete.label}"?`) : ''}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) {
            return;
          }
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) {
            navigate('/');
          }
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />

      {showSettingsModal && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex h-[86vh] w-[92vw] max-w-7xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className="absolute right-4 top-4 z-20 rounded-full bg-white/95 p-2 text-slate-500 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 pr-10">
                <h2 className="text-lg font-semibold text-slate-900">
                  {language === 'zh' ? '\u8bbe\u7f6e\u4e2d\u5fc3' : 'Settings Center'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {language === 'zh'
                    ? '\u7edf\u4e00\u7ba1\u7406\u5b9a\u65f6\u4efb\u52a1\u3001\u6280\u80fd\u3001\u9891\u9053\u3001\u4eea\u8868\u76d8\u548c\u5176\u4ed6\u8bbe\u7f6e'
                    : 'Manage cron, skills, channels, dashboard and other settings'}
                </p>
              </div>

              <div className="space-y-1">
                {settingsItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSettingsPanel(item.key)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                      settingsPanel === item.key
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900',
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-auto space-y-2 pt-4">
                <button
                  type="button"
                  onClick={() => setSettingsPanel('usecases')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    settingsPanel === 'usecases'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900',
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>{language === 'zh' ? '\u4f7f\u7528\u6848\u4f8b' : 'Use Cases'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsPanel('contact')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    settingsPanel === 'contact'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900',
                  )}
                >
                  <Mail className="h-4 w-4" />
                  <span>{language === 'zh' ? '\u8054\u7cfb\u6211\u4eec' : 'Contact Us'}</span>
                </button>
              </div>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden bg-white p-5">
              <div className="h-full overflow-auto rounded-[28px] border border-slate-200 bg-white p-4">
                {renderSettingsPanel()}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
