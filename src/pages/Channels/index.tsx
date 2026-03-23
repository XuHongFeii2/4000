/**
 * Channels Page
 * Manage messaging channel connections with configuration UI
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Power,
  PowerOff,
  QrCode,
  Loader2,
  X,
  ExternalLink,
  BookOpen,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useChannelsStore } from '@/stores/channels';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';
import { StatusBadge, type Status } from '@/components/common/StatusBadge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  CHANNEL_ICONS,
  getChannelDisplayName,
  getChannelMeta,
  getPrimaryChannels,
  type ChannelType,
  type Channel,
  type ChannelMeta,
  type ChannelConfigField,
} from '@/types/channel';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

function localizeEasyClawCopy(type: ChannelType | null, text: string, language: string): string {
  void language;

  if (type !== 'easyclaw') {
    return text;
  }

  return text.replace(/EasyClaw|easyclaw|openclaw中文版|openclaw\(chinese\)|ClawX|lobtalk app/g, '龙虾APP');
}

export function Channels() {
  const { t, i18n } = useTranslation('channels');
  const { channels, loading, error, fetchChannels, deleteChannel } = useChannelsStore();
  const gatewayStatus = useGatewayStore((state) => state.status);
  const location = useLocation();
  const navigate = useNavigate();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<ChannelType | null>(null);
  const [configuredTypes, setConfiguredTypes] = useState<string[]>([]);
  const [channelToDelete, setChannelToDelete] = useState<{ id: string } | null>(null);

  // Fetch channels on mount
  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Fetch configured channel types from config file
  const fetchConfiguredTypes = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('channel:listConfigured') as {
        success: boolean;
        channels?: string[];
      };
      if (result.success && result.channels) {
        setConfiguredTypes(result.channels);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchConfiguredTypes();
  }, [fetchConfiguredTypes]);

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('gateway:channel-status', () => {
      fetchChannels();
      fetchConfiguredTypes();
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [fetchChannels, fetchConfiguredTypes]);

  useEffect(() => {
    const state = location.state as { openChannelType?: ChannelType } | null;
    if (!state?.openChannelType) {
      return;
    }

    setSelectedChannelType(state.openChannelType);
    setShowAddDialog(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  // Get channel types to display
  const displayedChannelTypes = getPrimaryChannels();

  // Connected/disconnected channel counts
  const connectedCount = channels.filter((c) => c.status === 'connected').length;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchChannels}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('refresh')}
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('addChannel')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Radio className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{channels.length}</p>
                <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
                <Power className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{connectedCount}</p>
                <p className="text-sm text-muted-foreground">{t('stats.connected')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-800">
                <PowerOff className="h-6 w-6 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{channels.length - connectedCount}</p>
                <p className="text-sm text-muted-foreground">{t('stats.disconnected')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gateway Warning */}
      {gatewayStatus.state !== 'running' && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <span className="text-yellow-700 dark:text-yellow-400">
              {t('gatewayWarning')}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Configured Channels */}
      {channels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('configured')}</CardTitle>
            <CardDescription>{t('configuredDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {channels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  onDelete={() => setChannelToDelete({ id: channel.id })}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Channels */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('available')}</CardTitle>
              <CardDescription>
                {t('availableDesc')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {displayedChannelTypes.map((type) => {
              const language = i18n.resolvedLanguage ?? i18n.language;
              const meta = getChannelMeta(type, i18n.resolvedLanguage ?? i18n.language);
              const isConfigured = configuredTypes.includes(type);
              return (
                <button
                  key={type}
                  className={`p-4 rounded-lg border hover:bg-accent transition-colors text-left relative ${isConfigured ? 'border-green-500/50 bg-green-500/5' : ''}`}
                  onClick={() => {
                    setSelectedChannelType(type);
                    setShowAddDialog(true);
                  }}
                >
                  <span className="text-3xl">{meta.icon}</span>
                  <p className="font-medium mt-2">{meta.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {localizeEasyClawCopy(type, t(meta.description), language)}
                  </p>
                  {isConfigured && (
                    <Badge className="absolute top-2 right-2 text-xs bg-green-600 hover:bg-green-600">
                      {t('configuredBadge')}
                    </Badge>
                  )}
                  {!isConfigured && meta.isPlugin && (
                    <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
                      {t('pluginBadge')}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add Channel Dialog */}
      {showAddDialog && (
        <AddChannelDialog
          selectedType={selectedChannelType}
          onSelectType={setSelectedChannelType}
          onClose={() => {
            setShowAddDialog(false);
            setSelectedChannelType(null);
          }}
          onChannelAdded={() => {
            fetchChannels();
            fetchConfiguredTypes();
            setShowAddDialog(false);
            setSelectedChannelType(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!channelToDelete}
        title={t('common.confirm', 'Confirm')}
        message={t('deleteConfirm')}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (channelToDelete) {
            await deleteChannel(channelToDelete.id);
            setChannelToDelete(null);
          }
        }}
        onCancel={() => setChannelToDelete(null)}
      />
    </div>
  );
}

// ==================== Channel Card Component ====================

interface ChannelCardProps {
  channel: Channel;
  onDelete: () => void;
}

function ChannelCard({ channel, onDelete }: ChannelCardProps) {
  const { i18n } = useTranslation('channels');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {CHANNEL_ICONS[channel.type]}
            </span>
            <div>
              <CardTitle className="text-base">{channel.name}</CardTitle>
              <CardDescription className="text-xs">
                {getChannelDisplayName(channel.type, i18n.resolvedLanguage ?? i18n.language)}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={channel.status as Status} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {channel.error && (
          <p className="text-xs text-destructive mb-3">{channel.error}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Add Channel Dialog ====================

interface AddChannelDialogProps {
  selectedType: ChannelType | null;
  onSelectType: (type: ChannelType | null) => void;
  onClose: () => void;
  onChannelAdded: () => void;
}

function AddChannelDialog({ selectedType, onSelectType, onClose, onChannelAdded }: AddChannelDialogProps) {
  const { t, i18n } = useTranslation('channels');
  const { addChannel } = useChannelsStore();
  const setEasyClawBinding = useSettingsStore((state) => state.setEasyClawBinding);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [channelName, setChannelName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [isExistingConfig, setIsExistingConfig] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const language = i18n.resolvedLanguage ?? i18n.language;
  const isChinese = language.toLowerCase().startsWith('zh');
  const easyClawDisplayName = getChannelDisplayName('easyclaw', language);
  const meta: ChannelMeta | null = selectedType ? getChannelMeta(selectedType, language) : null;

  // Load existing config when a channel type is selected
  useEffect(() => {
    if (!selectedType) {
      setConfigValues({});
      setChannelName('');
      setIsExistingConfig(false);
      setQrCode(null);
      setConnecting(false);
      setValidationResult(null);
      return;
    }

    let cancelled = false;
    setLoadingConfig(true);
    setQrCode(null);
    setConnecting(false);
    setValidationResult(null);

    (async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'channel:getFormValues',
          selectedType
        ) as { success: boolean; values?: Record<string, string> };

        if (cancelled) return;

        if (result.success && result.values && Object.keys(result.values).length > 0) {
          setConfigValues(result.values);
          setIsExistingConfig(true);
        } else {
          setConfigValues({});
          setIsExistingConfig(false);
        }
      } catch {
        if (!cancelled) {
          setConfigValues({});
          setIsExistingConfig(false);
        }
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedType]);

  // Focus first input when form is ready (avoids Windows focus loss after native dialogs)
  useEffect(() => {
    if (selectedType && !loadingConfig && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [selectedType, loadingConfig]);

  // Listen for generic QR login events
  useEffect(() => {
    if (!selectedType || getChannelMeta(selectedType, language).connectionType !== 'qr') return;

    const onQr = (...args: unknown[]) => {
      const payload = args[0] as {
        channelType?: ChannelType;
        qrDataUrl?: string;
      } | undefined;

      if (payload?.channelType !== selectedType || !payload.qrDataUrl) {
        return;
      }

      setQrCode(payload.qrDataUrl);
      setConnecting(false);
    };

    const onSuccess = async (...args: unknown[]) => {
      const payload = args[0] as {
        channelType?: ChannelType;
        data?: unknown;
      } | undefined;

      if (payload?.channelType !== selectedType) {
        return;
      }

      setQrCode(null);

      try {
        if (selectedType === 'whatsapp') {
          const data = payload.data as { accountId?: string } | undefined;
          const accountId = data?.accountId || channelName.trim() || 'default';
          const saveResult = await window.electron.ipcRenderer.invoke(
            'channel:saveConfig',
            'whatsapp',
            { enabled: true }
          ) as { success?: boolean; error?: string };

          if (!saveResult?.success) {
            throw new Error(saveResult?.error || 'Failed to save WhatsApp config');
          }

          await addChannel({
            type: 'whatsapp',
            name: channelName || 'WhatsApp',
          });

          toast.success(t('toast.whatsappConnected'));
          console.info('Saved WhatsApp config for account:', accountId);
          await window.electron.ipcRenderer.invoke('gateway:restart');
          onChannelAdded();
          return;
        }

        if (selectedType === 'easyclaw') {
          const data = payload.data as {
            serverUrl: string;
            deviceId: string;
            deviceToken: string;
            botId?: number;
            botName?: string;
            userEmail?: string;
            userAccount?: string;
            userDisplayName?: string;
            userAvatarUrl?: string;
          };
          const channelDisplayName = data.botName || easyClawDisplayName;
          const saveResult = await window.electron.ipcRenderer.invoke(
            'channel:saveConfig',
            'easyclaw',
            {
              enabled: true,
              name: channelDisplayName,
              serverUrl: data.serverUrl,
              deviceId: data.deviceId,
              deviceToken: data.deviceToken,
              ...(typeof data.botId === 'number' ? { botId: data.botId } : {}),
            }
          ) as { success?: boolean; error?: string };

          if (!saveResult?.success) {
            throw new Error(saveResult?.error || `Failed to save ${easyClawDisplayName} config`);
          }

          await addChannel({
            type: 'easyclaw',
            name: channelDisplayName,
          });

          setEasyClawBinding({
            account: data.userAccount || data.userEmail || '',
            name: data.userDisplayName || data.userAccount || data.userEmail || channelDisplayName,
            avatar: data.userAvatarUrl || '',
          });

          toast.success(
            data.userEmail
              ? (isChinese
                ? `${easyClawDisplayName} 已绑定到 ${data.userEmail}`
                : `${easyClawDisplayName} bound to ${data.userEmail}`)
              : (isChinese
                ? `${easyClawDisplayName} 绑定成功`
                : `${easyClawDisplayName} binding succeeded`)
          );
          await window.electron.ipcRenderer.invoke('gateway:restart');
          onChannelAdded();
        }
      } catch (error) {
        toast.error(t('toast.configFailed', { error: String(error) }));
      } finally {
        setConnecting(false);
      }
    };

    const onError = (...args: unknown[]) => {
      const payload = args[0] as {
        channelType?: ChannelType;
        error?: string;
      } | undefined;

      if (payload?.channelType !== selectedType) {
        return;
      }

      const error = String(payload?.error ?? 'Binding failed');
      if (selectedType === 'whatsapp') {
        toast.error(t('toast.whatsappFailed', { error }));
      } else {
        toast.error(error);
      }
      setConnecting(false);
      setQrCode(null);
    };

    const removeQrListener = window.electron.ipcRenderer.on('channel:qr', onQr);
    const removeSuccessListener = window.electron.ipcRenderer.on('channel:qr-success', onSuccess);
    const removeErrorListener = window.electron.ipcRenderer.on('channel:qr-error', onError);

    return () => {
      if (typeof removeQrListener === 'function') removeQrListener();
      if (typeof removeSuccessListener === 'function') removeSuccessListener();
      if (typeof removeErrorListener === 'function') removeErrorListener();
      window.electron.ipcRenderer.invoke('channel:cancelQrLogin', selectedType).catch(() => { });
    };
  }, [selectedType, addChannel, channelName, onChannelAdded, t, language, isChinese, easyClawDisplayName, setEasyClawBinding]);

  /*
  useEffect(() => {
    return;

    const onQr = (...args: unknown[]) => {
      const data = args[0] as { qr: string };
      setQrCode(`data:image/png;base64,${data.qr}`);
      setConnecting(false);
    };

    const onSuccess = async (...args: unknown[]) => {
      const data = args[0] as {
        serverUrl: string;
        deviceId: string;
        deviceToken: string;
        botId?: number;
        botName?: string;
        userEmail?: string;
      };

      try {
        const saveResult = await window.electron.ipcRenderer.invoke(
          'channel:saveConfig',
          'easyclaw',
          {
            enabled: true,
            name: data.botName || easyClawDisplayName,
            serverUrl: data.serverUrl,
            deviceId: data.deviceId,
            deviceToken: data.deviceToken,
            ...(typeof data.botId === 'number' ? { botId: data.botId } : {}),
          }
        ) as { success?: boolean; error?: string };

        if (!saveResult?.success) {
          throw new Error(saveResult?.error || `Failed to save ${easyClawDisplayName} config`);
        }

        await addChannel({
          type: 'easyclaw',
          name: data.botName || easyClawDisplayName,
        });

        toast.success(
          data.userEmail
            ? `${easyClawDisplayName} 已绑定到 ${data.userEmail}`
            : `${easyClawDisplayName} 绑定成功`
        );
        onChannelAdded();
      } catch (error) {
        toast.error(t('toast.configFailed', { error: String(error) }));
        setConnecting(false);
      }
    };

    const onError = (...args: unknown[]) => {
      const error = String(args[0] ?? '绑定失败');
      toast.error(error);
      setConnecting(false);
      setQrCode(null);
    };

    const removeQrListener = window.electron.ipcRenderer.on('channel:qr', onQr);
    const removeSuccessListener = window.electron.ipcRenderer.on('channel:qr-success', onSuccess);
    const removeErrorListener = window.electron.ipcRenderer.on('channel:qr-error', onError);

    return () => {
      if (typeof removeQrListener === 'function') removeQrListener();
      if (typeof removeSuccessListener === 'function') removeSuccessListener();
      if (typeof removeErrorListener === 'function') removeErrorListener();
      window.electron.ipcRenderer.invoke('channel:cancelQrLogin', selectedType).catch(() => { });
    };
  }, [selectedType, addChannel, onChannelAdded, t]);

  useEffect(() => {
    return;

    setConnecting(true);
    window.electron.ipcRenderer.invoke('channel:requestQrLogin', selectedType).then((result) => {
      const payload = result as { success?: boolean; error?: string };
      if (!payload?.success) {
        throw new Error(payload?.error || `Failed to start ${easyClawDisplayName} binding`);
      }
    }).catch((error) => {
      toast.error(String(error));
      setConnecting(false);
    });
  }, [selectedType, loadingConfig, qrCode, connecting]);
  */

  const handleValidate = async () => {
    if (!selectedType) return;

    setValidating(true);
    setValidationResult(null);

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'channel:validateCredentials',
        selectedType,
        configValues
      ) as {
        success: boolean;
        valid?: boolean;
        errors?: string[];
        warnings?: string[];
        details?: Record<string, string>;
      };

      const warnings = result.warnings || [];
      if (result.valid && result.details) {
        const details = result.details;
        if (details.botUsername) warnings.push(`Bot: @${details.botUsername}`);
        if (details.guildName) warnings.push(`Server: ${details.guildName}`);
        if (details.channelName) warnings.push(`Channel: #${details.channelName}`);
      }

      setValidationResult({
        valid: result.valid || false,
        errors: result.errors || [],
        warnings,
      });
    } catch (error) {
      setValidationResult({
        valid: false,
        errors: [String(error)],
        warnings: [],
      });
    } finally {
      setValidating(false);
    }
  };


  const handleConnect = async () => {
    if (!selectedType || !meta) return;

    setConnecting(true);
    setValidationResult(null);

    try {
      // For QR-based channels, request QR code
      if (meta.connectionType === 'qr') {
        const result = await window.electron.ipcRenderer.invoke(
          'channel:requestQrLogin',
          selectedType,
          selectedType === 'whatsapp'
            ? { accountId: channelName.trim() || 'default' }
            : undefined
        ) as {
          success?: boolean;
          error?: string;
        };

        if (!result?.success) {
          throw new Error(result?.error || `Failed to start QR login for ${selectedType}`);
        }

        return;
      }

      // Step 1: Validate credentials against the actual service API
      if (meta.connectionType === 'token') {
        const validationResponse = await window.electron.ipcRenderer.invoke(
          'channel:validateCredentials',
          selectedType,
          configValues
        ) as {
          success: boolean;
          valid?: boolean;
          errors?: string[];
          warnings?: string[];
          details?: Record<string, string>;
        };

        if (!validationResponse.valid) {
          setValidationResult({
            valid: false,
            errors: validationResponse.errors || ['Validation failed'],
            warnings: validationResponse.warnings || [],
          });
          setConnecting(false);
          return;
        }

        // Show success details (bot name, guild name, etc.) as warnings/info
        const warnings = validationResponse.warnings || [];
        if (validationResponse.details) {
          const details = validationResponse.details;
          if (details.botUsername) {
            warnings.push(`Bot: @${details.botUsername}`);
          }
          if (details.guildName) {
            warnings.push(`Server: ${details.guildName}`);
          }
          if (details.channelName) {
            warnings.push(`Channel: #${details.channelName}`);
          }
        }

        // Show validation success with details
        setValidationResult({
          valid: true,
          errors: [],
          warnings,
        });
      }

      // Step 2: Save channel configuration via IPC
      const config: Record<string, unknown> = { ...configValues };
      const saveResult = await window.electron.ipcRenderer.invoke('channel:saveConfig', selectedType, config) as {
        success?: boolean;
        error?: string;
        warning?: string;
        pluginInstalled?: boolean;
      };
      if (!saveResult?.success) {
        throw new Error(saveResult?.error || 'Failed to save channel config');
      }
      if (typeof saveResult.warning === 'string' && saveResult.warning) {
        toast.warning(saveResult.warning);
      }

      // Step 3: Add a local channel entry for the UI
      await addChannel({
        type: selectedType,
        name: channelName || getChannelDisplayName(selectedType, language),
        token: configValues[meta.configFields[0]?.key] || undefined,
      });

      toast.success(t('toast.channelSaved', { name: meta.name }));

      // Gateway restart is now handled server-side via debouncedRestart()
      // inside the channel:saveConfig IPC handler, so we don't need to
      // trigger it explicitly here.  This avoids cascading restarts when
      // multiple config changes happen in quick succession (e.g. during
      // the setup wizard).
      toast.success(t('toast.channelConnecting', { name: meta.name }));

      // Brief delay so user can see the success state before dialog closes
      await new Promise((resolve) => setTimeout(resolve, 800));
      onChannelAdded();
    } catch (error) {
      toast.error(t('toast.configFailed', { error }));
      setConnecting(false);
    }
  };

  const openDocs = () => {
    if (meta?.docsUrl) {
      const url = t(meta.docsUrl);
      try {
        if (window.electron?.openExternal) {
          window.electron.openExternal(url);
        } else {
          // Fallback: open in new window
          window.open(url, '_blank');
        }
      } catch (error) {
        console.error('Failed to open docs:', error);
        // Fallback: open in new window
        window.open(url, '_blank');
      }
    }
  };


  const isFormValid = () => {
    if (!meta) return false;

    // Check all required fields are filled
    return meta.configFields
      .filter((field) => field.required)
      .every((field) => configValues[field.key]?.trim());
  };

  const updateConfigValue = (key: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>
              {selectedType
                ? isExistingConfig
                  ? t('dialog.updateTitle', { name: getChannelDisplayName(selectedType, language) })
                  : t('dialog.configureTitle', { name: getChannelDisplayName(selectedType, language) })
                : t('dialog.addTitle')}
            </CardTitle>
            <CardDescription>
              {selectedType && isExistingConfig
                ? t('dialog.existingDesc')
                : meta ? localizeEasyClawCopy(selectedType, t(meta.description), language) : t('dialog.selectDesc')}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedType ? (
            // Channel type selection
            <div className="grid grid-cols-2 gap-4">
              {getPrimaryChannels().map((type) => {
                const channelMeta = getChannelMeta(type, language);
                return (
                  <button
                    key={type}
                    onClick={() => onSelectType(type)}
                    className="p-4 rounded-lg border hover:bg-accent transition-colors text-left"
                  >
                    <span className="text-3xl">{channelMeta.icon}</span>
                    <p className="font-medium mt-2">{channelMeta.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {channelMeta.connectionType === 'qr' ? t('dialog.qrCode') : t('dialog.token')}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : qrCode ? (
            // QR Code display
            <div className="text-center space-y-4">
              <div className="bg-white p-4 rounded-lg inline-block shadow-sm border">
                {qrCode.startsWith('data:image') ? (
                  <img src={qrCode} alt="Scan QR Code" className="w-64 h-64 object-contain" />
                ) : (
                  <div className="w-64 h-64 bg-gray-100 flex items-center justify-center">
                    <QrCode className="h-32 w-32 text-gray-400" />
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('dialog.scanQR', { name: meta?.name })}
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => {
                  setQrCode(null);
                  handleConnect(); // Retry
                }}>
                  {t('dialog.refreshCode')}
                </Button>
              </div>
            </div>
          ) : loadingConfig ? (
            // Loading saved config
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t('dialog.loadingConfig')}</span>
            </div>
          ) : (
            // Connection form
            <div className="space-y-4">
              {/* Existing config hint */}
              {isExistingConfig && (
                <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-3 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{t('dialog.existingHint')}</span>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{t('dialog.howToConnect')}</p>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-sm"
                    onClick={openDocs}
                  >
                    <BookOpen className="h-3 w-3 mr-1" />
                    {t('dialog.viewDocs')}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                  {meta?.instructions.map((instruction, i) => (
                    <li key={i}>{localizeEasyClawCopy(selectedType, t(instruction), language)}</li>
                  ))}
                </ol>
              </div>

              {/* Channel name */}
              {selectedType !== 'easyclaw' && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t('dialog.channelName')}</Label>
                  <Input
                    ref={firstInputRef}
                    id="name"
                    placeholder={t('dialog.channelNamePlaceholder', { name: meta?.name })}
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                  />
                </div>
              )}

              {/* Configuration fields */}
              {meta?.configFields.map((field) => (
                <ConfigField
                  key={field.key}
                  field={field}
                  value={configValues[field.key] || ''}
                  onChange={(value) => updateConfigValue(field.key, value)}
                  showSecret={showSecrets[field.key] || false}
                  onToggleSecret={() => toggleSecretVisibility(field.key)}
                />
              ))}

              {/* Validation Results */}
              {validationResult && (
                <div className={`p-4 rounded-lg text-sm ${validationResult.valid ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'
                  }`}>
                  <div className="flex items-start gap-2">
                    {validationResult.valid ? (
                      <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h4 className="font-medium mb-1">
                        {validationResult.valid ? t('dialog.credentialsVerified') : t('dialog.validationFailed')}
                      </h4>
                      {validationResult.errors.length > 0 && (
                        <ul className="list-disc list-inside space-y-0.5">
                          {validationResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      )}
                      {validationResult.valid && validationResult.warnings.length > 0 && (
                        <div className="mt-1 text-green-600 dark:text-green-400 space-y-0.5">
                          {validationResult.warnings.map((info, i) => (
                            <p key={i} className="text-xs">{info}</p>
                          ))}
                        </div>
                      )}
                      {!validationResult.valid && validationResult.warnings.length > 0 && (
                        <div className="mt-2 text-yellow-600 dark:text-yellow-500">
                          <p className="font-medium text-xs uppercase mb-1">{t('dialog.warnings')}</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {validationResult.warnings.map((warn, i) => (
                              <li key={i}>{warn}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => onSelectType(null)}>
                  {t('dialog.back')}
                </Button>
                <div className="flex gap-2">
                  {/* Validation Button - Only for token-based channels for now */}
                  {meta?.connectionType === 'token' && selectedType !== 'easyclaw' && (
                    <Button
                      variant="secondary"
                      onClick={handleValidate}
                      disabled={validating}
                    >
                      {validating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('dialog.validating')}
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4 mr-2" />
                          {t('dialog.validateConfig')}
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={handleConnect}
                    disabled={connecting || !isFormValid()}
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {meta?.connectionType === 'qr' ? t('dialog.generatingQR') : t('dialog.validatingAndSaving')}
                      </>
                    ) : meta?.connectionType === 'qr' ? (
                      t('dialog.generateQRCode')
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        {isExistingConfig ? t('dialog.updateAndReconnect') : t('dialog.saveAndConnect')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div >
  );
}

// ==================== Config Field Component ====================

interface ConfigFieldProps {
  field: ChannelConfigField;
  value: string;
  onChange: (value: string) => void;
  showSecret: boolean;
  onToggleSecret: () => void;
}

function ConfigField({ field, value, onChange, showSecret, onToggleSecret }: ConfigFieldProps) {
  const { t } = useTranslation('channels');
  const isPassword = field.type === 'password';

  return (
    <div className="space-y-2">
      <Label htmlFor={field.key}>
        {t(field.label)}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex gap-2">
        <Input
          id={field.key}
          type={isPassword && !showSecret ? 'password' : 'text'}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
        />
        {isPassword && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onToggleSecret}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {field.description && (
        <p className="text-xs text-muted-foreground">
          {t(field.description)}
        </p>
      )}
      {field.envVar && (
        <p className="text-xs text-muted-foreground">
          {t('dialog.envVar', { var: field.envVar })}
        </p>
      )}
    </div>
  );
}

export default Channels;
