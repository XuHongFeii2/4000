/**
 * Channel Configuration Utilities
 * Manages channel configuration in OpenClaw config files.
 *
 * All file I/O uses async fs/promises to avoid blocking the main thread.
 */
import { access, mkdir, readFile, writeFile, readdir, stat, rm } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getOpenClawResolvedDir } from './paths';
import * as logger from './logger';
import { proxyAwareFetch } from './proxy-fetch';

const OPENCLAW_DIR = join(homedir(), '.openclaw');
const CONFIG_FILE = join(OPENCLAW_DIR, 'openclaw.json');
const EASYCLAW_CHANNEL_ID = 'easyclaw';
const LEGACY_EASYCLAW_CHANNEL_ID = 'clawx-im';

// Channels that are managed as plugins (config goes under plugins.entries, not channels)
const PLUGIN_CHANNELS = ['whatsapp'];

function ensureAllowedPlugin(config: OpenClawConfig, pluginId: string): void {
    if (!config.plugins) {
        config.plugins = {};
    }
    config.plugins.enabled = true;
    const allow = Array.isArray(config.plugins.allow)
        ? config.plugins.allow as string[]
        : [];
    if (!allow.includes(pluginId)) {
        config.plugins.allow = [...allow, pluginId];
    }
}

function ensurePluginEntryEnabled(
    config: OpenClawConfig,
    pluginId: string,
    enabled: boolean
): void {
    if (!config.plugins) {
        config.plugins = {};
    }
    if (!config.plugins.entries) {
        config.plugins.entries = {};
    }
    config.plugins.entries[pluginId] = {
        ...config.plugins.entries[pluginId],
        enabled,
    };
}

// ── Helpers ──────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
    try { await access(p, constants.F_OK); return true; } catch { return false; }
}

function isEasyClawChannel(channelType: string): boolean {
    return channelType === EASYCLAW_CHANNEL_ID || channelType === LEGACY_EASYCLAW_CHANNEL_ID;
}

function normalizeChannelType(channelType: string): string {
    return isEasyClawChannel(channelType) ? EASYCLAW_CHANNEL_ID : channelType;
}

function getStoredChannelConfig(config: OpenClawConfig, channelType: string): ChannelConfigData | undefined {
    const normalizedType = normalizeChannelType(channelType);
    if (normalizedType === EASYCLAW_CHANNEL_ID) {
        return config.channels?.[EASYCLAW_CHANNEL_ID] ?? config.channels?.[LEGACY_EASYCLAW_CHANNEL_ID];
    }
    return config.channels?.[normalizedType];
}

function deleteStoredChannelConfig(config: OpenClawConfig, channelType: string): void {
    if (!config.channels) return;

    const normalizedType = normalizeChannelType(channelType);
    delete config.channels[normalizedType];

    if (normalizedType === EASYCLAW_CHANNEL_ID) {
        delete config.channels[LEGACY_EASYCLAW_CHANNEL_ID];
    }

    if (Object.keys(config.channels).length === 0) {
        delete config.channels;
    }
}

// ── Types ────────────────────────────────────────────────────────

export interface ChannelConfigData {
    enabled?: boolean;
    [key: string]: unknown;
}

export interface PluginsConfig {
    entries?: Record<string, ChannelConfigData>;
    [key: string]: unknown;
}

export interface OpenClawConfig {
    channels?: Record<string, ChannelConfigData>;
    plugins?: PluginsConfig;
    [key: string]: unknown;
}

// ── Config I/O ───────────────────────────────────────────────────

async function ensureConfigDir(): Promise<void> {
    if (!(await fileExists(OPENCLAW_DIR))) {
        await mkdir(OPENCLAW_DIR, { recursive: true });
    }
}

export async function readOpenClawConfig(): Promise<OpenClawConfig> {
    await ensureConfigDir();

    if (!(await fileExists(CONFIG_FILE))) {
        return {};
    }

    try {
        const content = await readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(content) as OpenClawConfig;
    } catch (error) {
        logger.error('Failed to read OpenClaw config', error);
        console.error('Failed to read OpenClaw config:', error);
        return {};
    }
}

export async function writeOpenClawConfig(config: OpenClawConfig): Promise<void> {
    await ensureConfigDir();

    try {
        await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
        logger.error('Failed to write OpenClaw config', error);
        console.error('Failed to write OpenClaw config:', error);
        throw error;
    }
}

// ── Channel operations ───────────────────────────────────────────

export async function saveChannelConfig(
    channelType: string,
    config: ChannelConfigData
): Promise<void> {
    const currentConfig = await readOpenClawConfig();
    const normalizedType = normalizeChannelType(channelType);

    if (normalizedType === 'dingtalk') {
        ensureAllowedPlugin(currentConfig, 'dingtalk');
    }

    if (normalizedType === EASYCLAW_CHANNEL_ID) {
        ensureAllowedPlugin(currentConfig, EASYCLAW_CHANNEL_ID);
        ensurePluginEntryEnabled(currentConfig, EASYCLAW_CHANNEL_ID, config.enabled ?? true);
        if (currentConfig.plugins?.entries?.[LEGACY_EASYCLAW_CHANNEL_ID]) {
            delete currentConfig.plugins.entries[LEGACY_EASYCLAW_CHANNEL_ID];
        }
    }

    // Plugin-based channels (e.g. WhatsApp) go under plugins.entries, not channels
    if (PLUGIN_CHANNELS.includes(normalizedType)) {
        if (!currentConfig.plugins) {
            currentConfig.plugins = {};
        }
        if (!currentConfig.plugins.entries) {
            currentConfig.plugins.entries = {};
        }
        currentConfig.plugins.entries[normalizedType] = {
            ...currentConfig.plugins.entries[normalizedType],
            enabled: config.enabled ?? true,
        };
        await writeOpenClawConfig(currentConfig);
        logger.info('Plugin channel config saved', {
            channelType: normalizedType,
            configFile: CONFIG_FILE,
            path: `plugins.entries.${normalizedType}`,
        });
        console.log(`Saved plugin channel config for ${normalizedType}`);
        return;
    }

    if (!currentConfig.channels) {
        currentConfig.channels = {};
    }

    // Transform config to match OpenClaw expected format
    let transformedConfig: ChannelConfigData = { ...config };

    // Special handling for Discord: convert guildId/channelId to complete structure
    if (normalizedType === 'discord') {
        const { guildId, channelId, ...restConfig } = config;
        transformedConfig = { ...restConfig };

        transformedConfig.groupPolicy = 'allowlist';
        transformedConfig.dm = { enabled: false };
        transformedConfig.retry = {
            attempts: 3,
            minDelayMs: 500,
            maxDelayMs: 30000,
            jitter: 0.1,
        };

        if (guildId && typeof guildId === 'string' && guildId.trim()) {
            const guildConfig: Record<string, unknown> = {
                users: ['*'],
                requireMention: true,
            };

            if (channelId && typeof channelId === 'string' && channelId.trim()) {
                guildConfig.channels = {
                    [channelId.trim()]: { allow: true, requireMention: true }
                };
            } else {
                guildConfig.channels = {
                    '*': { allow: true, requireMention: true }
                };
            }

            transformedConfig.guilds = {
                [guildId.trim()]: guildConfig
            };
        }
    }

    // Special handling for Telegram: convert allowedUsers string to allowlist array
    if (normalizedType === 'telegram') {
        const { allowedUsers, ...restConfig } = config;
        transformedConfig = { ...restConfig };

        if (allowedUsers && typeof allowedUsers === 'string') {
            const users = allowedUsers.split(',')
                .map(u => u.trim())
                .filter(u => u.length > 0);

            if (users.length > 0) {
                transformedConfig.allowFrom = users;
            }
        }
    }

    // Special handling for Feishu: default to open DM policy with wildcard allowlist
    if (normalizedType === 'feishu') {
        const existingConfig = getStoredChannelConfig(currentConfig, normalizedType) || {};
        transformedConfig.dmPolicy = transformedConfig.dmPolicy ?? existingConfig.dmPolicy ?? 'open';

        let allowFrom = transformedConfig.allowFrom ?? existingConfig.allowFrom ?? ['*'];
        if (!Array.isArray(allowFrom)) {
            allowFrom = [allowFrom];
        }

        if (transformedConfig.dmPolicy === 'open' && !allowFrom.includes('*')) {
            allowFrom = [...allowFrom, '*'];
        }

        transformedConfig.allowFrom = allowFrom;
    }

    // Merge with existing config
    currentConfig.channels[normalizedType] = {
        ...(getStoredChannelConfig(currentConfig, normalizedType) ?? {}),
        ...transformedConfig,
        enabled: transformedConfig.enabled ?? true,
    };
    if (normalizedType === EASYCLAW_CHANNEL_ID && currentConfig.channels[LEGACY_EASYCLAW_CHANNEL_ID]) {
        delete currentConfig.channels[LEGACY_EASYCLAW_CHANNEL_ID];
    }

    await writeOpenClawConfig(currentConfig);
    logger.info('Channel config saved', {
        channelType: normalizedType,
        configFile: CONFIG_FILE,
        rawKeys: Object.keys(config),
        transformedKeys: Object.keys(transformedConfig),
        enabled: currentConfig.channels[normalizedType]?.enabled,
    });
    console.log(`Saved channel config for ${normalizedType}`);
}

export async function getChannelConfig(channelType: string): Promise<ChannelConfigData | undefined> {
    const config = await readOpenClawConfig();
    return getStoredChannelConfig(config, channelType);
}

export async function getChannelFormValues(channelType: string): Promise<Record<string, string> | undefined> {
    const saved = await getChannelConfig(channelType);
    if (!saved) return undefined;

    const values: Record<string, string> = {};

    if (channelType === 'discord') {
        if (saved.token && typeof saved.token === 'string') {
            values.token = saved.token;
        }
        const guilds = saved.guilds as Record<string, Record<string, unknown>> | undefined;
        if (guilds) {
            const guildIds = Object.keys(guilds);
            if (guildIds.length > 0) {
                values.guildId = guildIds[0];
                const guildConfig = guilds[guildIds[0]];
                const channels = guildConfig?.channels as Record<string, unknown> | undefined;
                if (channels) {
                    const channelIds = Object.keys(channels).filter((id) => id !== '*');
                    if (channelIds.length > 0) {
                        values.channelId = channelIds[0];
                    }
                }
            }
        }
    } else if (channelType === 'telegram') {
        if (Array.isArray(saved.allowFrom)) {
            values.allowedUsers = saved.allowFrom.join(', ');
        }
        for (const [key, value] of Object.entries(saved)) {
            if (typeof value === 'string' && key !== 'enabled') {
                values[key] = value;
            }
        }
    } else {
        for (const [key, value] of Object.entries(saved)) {
            if (typeof value === 'string' && key !== 'enabled') {
                values[key] = value;
            }
        }
    }

    return Object.keys(values).length > 0 ? values : undefined;
}

export async function deleteChannelConfig(channelType: string): Promise<void> {
    const currentConfig = await readOpenClawConfig();
    const normalizedType = normalizeChannelType(channelType);

    if (getStoredChannelConfig(currentConfig, normalizedType)) {
        deleteStoredChannelConfig(currentConfig, normalizedType);
        if (normalizedType === EASYCLAW_CHANNEL_ID) {
            if (currentConfig.plugins?.entries?.[EASYCLAW_CHANNEL_ID]) {
                delete currentConfig.plugins.entries[EASYCLAW_CHANNEL_ID];
            }
            if (currentConfig.plugins?.entries?.[LEGACY_EASYCLAW_CHANNEL_ID]) {
                delete currentConfig.plugins.entries[LEGACY_EASYCLAW_CHANNEL_ID];
            }
        }
        await writeOpenClawConfig(currentConfig);
        console.log(`Deleted channel config for ${normalizedType}`);
    } else if (PLUGIN_CHANNELS.includes(normalizedType)) {
        if (currentConfig.plugins?.entries?.[normalizedType]) {
            delete currentConfig.plugins.entries[normalizedType];
            if (Object.keys(currentConfig.plugins.entries).length === 0) {
                delete currentConfig.plugins.entries;
            }
            if (currentConfig.plugins && Object.keys(currentConfig.plugins).length === 0) {
                delete currentConfig.plugins;
            }
            await writeOpenClawConfig(currentConfig);
            console.log(`Deleted plugin channel config for ${normalizedType}`);
        }
    }

    // Special handling for WhatsApp credentials
    if (normalizedType === 'whatsapp') {
        try {
            const whatsappDir = join(homedir(), '.openclaw', 'credentials', 'whatsapp');
            if (await fileExists(whatsappDir)) {
                await rm(whatsappDir, { recursive: true, force: true });
                console.log('Deleted WhatsApp credentials directory');
            }
        } catch (error) {
            console.error('Failed to delete WhatsApp credentials:', error);
        }
    }
}

export async function listConfiguredChannels(): Promise<string[]> {
    const config = await readOpenClawConfig();
    const channels: string[] = [];

    if (config.channels) {
        for (const channelType of Object.keys(config.channels)) {
            if (config.channels[channelType]?.enabled === false) continue;
            const normalizedType = normalizeChannelType(channelType);
            if (!channels.includes(normalizedType)) {
                channels.push(normalizedType);
            }
        }
    }

    // Check for WhatsApp credentials directory
    try {
        const whatsappDir = join(homedir(), '.openclaw', 'credentials', 'whatsapp');
        if (await fileExists(whatsappDir)) {
            const entries = await readdir(whatsappDir);
            const hasSession = await (async () => {
                for (const entry of entries) {
                    try {
                        const s = await stat(join(whatsappDir, entry));
                        if (s.isDirectory()) return true;
                    } catch { /* ignore */ }
                }
                return false;
            })();

            if (hasSession && !channels.includes('whatsapp')) {
                channels.push('whatsapp');
            }
        }
    } catch {
        // Ignore errors checking whatsapp dir
    }

    return channels;
}

export async function setChannelEnabled(channelType: string, enabled: boolean): Promise<void> {
    const currentConfig = await readOpenClawConfig();
    const normalizedType = normalizeChannelType(channelType);

    if (PLUGIN_CHANNELS.includes(normalizedType)) {
        if (!currentConfig.plugins) currentConfig.plugins = {};
        if (!currentConfig.plugins.entries) currentConfig.plugins.entries = {};
        if (!currentConfig.plugins.entries[normalizedType]) currentConfig.plugins.entries[normalizedType] = {};
        currentConfig.plugins.entries[normalizedType].enabled = enabled;
        await writeOpenClawConfig(currentConfig);
        console.log(`Set plugin channel ${normalizedType} enabled: ${enabled}`);
        return;
    }

    if (normalizedType === EASYCLAW_CHANNEL_ID) {
        ensureAllowedPlugin(currentConfig, EASYCLAW_CHANNEL_ID);
        ensurePluginEntryEnabled(currentConfig, EASYCLAW_CHANNEL_ID, enabled);
        if (currentConfig.plugins?.entries?.[LEGACY_EASYCLAW_CHANNEL_ID]) {
            delete currentConfig.plugins.entries[LEGACY_EASYCLAW_CHANNEL_ID];
        }
    }

    if (!currentConfig.channels) currentConfig.channels = {};
    const existingConfig = getStoredChannelConfig(currentConfig, normalizedType) ?? {};
    currentConfig.channels[normalizedType] = {
        ...existingConfig,
        enabled,
    };
    if (normalizedType === EASYCLAW_CHANNEL_ID && currentConfig.channels[LEGACY_EASYCLAW_CHANNEL_ID]) {
        delete currentConfig.channels[LEGACY_EASYCLAW_CHANNEL_ID];
    }
    await writeOpenClawConfig(currentConfig);
    console.log(`Set channel ${normalizedType} enabled: ${enabled}`);
}

// ── Validation ───────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface CredentialValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    details?: Record<string, string>;
}

export async function validateChannelCredentials(
    channelType: string,
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    switch (channelType) {
        case 'discord':
            return validateDiscordCredentials(config);
        case 'telegram':
            return validateTelegramCredentials(config);
        case 'easyclaw':
        case 'clawx-im':
            return validateClawxCredentials(config);
        default:
            return { valid: true, errors: [], warnings: ['No online validation available for this channel type.'] };
    }
}

async function validateClawxCredentials(
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    const serverUrl = config.serverUrl?.trim();
    const deviceId = config.deviceId?.trim();
    const deviceToken = config.deviceToken?.trim();
    if (!serverUrl) {
        return { valid: false, errors: ['Server URL is required'], warnings: [] };
    }
    if (!deviceId) {
        return { valid: false, errors: ['Device ID is required'], warnings: [] };
    }
    if (!deviceToken) {
        return { valid: false, errors: ['Device token is required'], warnings: [] };
    }

    let normalizedUrl: string;
    try {
        normalizedUrl = new URL(serverUrl).toString().replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
    } catch {
        return { valid: false, errors: ['Server URL is invalid'], warnings: [] };
    }

    try {
        const response = await proxyAwareFetch(`${normalizedUrl}/api/v1/openapi.json`);
        if (!response.ok) {
            return {
                valid: false,
                errors: [`龙虾APP backend is unreachable: ${response.status}`],
                warnings: [],
            };
        }
        return {
            valid: true,
            errors: [],
            warnings: ['龙虾APP plugin is configured. Replies will be routed by the backend using the provided device credentials.'],
        };
    } catch (error) {
        return {
            valid: false,
            errors: [`Connection error: ${error instanceof Error ? error.message : String(error)}`],
            warnings: [],
        };
    }
}

async function validateDiscordCredentials(
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    const result: CredentialValidationResult = { valid: true, errors: [], warnings: [], details: {} };
    const token = config.token?.trim();

    if (!token) {
        return { valid: false, errors: ['Bot token is required'], warnings: [] };
    }

    try {
        const meResponse = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` },
        });
        if (!meResponse.ok) {
            if (meResponse.status === 401) {
                return { valid: false, errors: ['Invalid bot token. Please check and try again.'], warnings: [] };
            }
            const errorData = await meResponse.json().catch(() => ({}));
            const msg = (errorData as { message?: string }).message || `Discord API error: ${meResponse.status}`;
            return { valid: false, errors: [msg], warnings: [] };
        }
        const meData = (await meResponse.json()) as { username?: string; id?: string; bot?: boolean };
        if (!meData.bot) {
            return { valid: false, errors: ['The provided token belongs to a user account, not a bot. Please use a bot token.'], warnings: [] };
        }
        result.details!.botUsername = meData.username || 'Unknown';
        result.details!.botId = meData.id || '';
    } catch (error) {
        return { valid: false, errors: [`Connection error when validating bot token: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
    }

    const guildId = config.guildId?.trim();
    if (guildId) {
        try {
            const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
                headers: { Authorization: `Bot ${token}` },
            });
            if (!guildResponse.ok) {
                if (guildResponse.status === 403 || guildResponse.status === 404) {
                    result.errors.push(`Cannot access guild (server) with ID "${guildId}". Make sure the bot has been invited to this server.`);
                    result.valid = false;
                } else {
                    result.errors.push(`Failed to verify guild ID: Discord API returned ${guildResponse.status}`);
                    result.valid = false;
                }
            } else {
                const guildData = (await guildResponse.json()) as { name?: string };
                result.details!.guildName = guildData.name || 'Unknown';
            }
        } catch (error) {
            result.warnings.push(`Could not verify guild ID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const channelId = config.channelId?.trim();
    if (channelId) {
        try {
            const channelResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
                headers: { Authorization: `Bot ${token}` },
            });
            if (!channelResponse.ok) {
                if (channelResponse.status === 403 || channelResponse.status === 404) {
                    result.errors.push(`Cannot access channel with ID "${channelId}". Make sure the bot has permission to view this channel.`);
                    result.valid = false;
                } else {
                    result.errors.push(`Failed to verify channel ID: Discord API returned ${channelResponse.status}`);
                    result.valid = false;
                }
            } else {
                const channelData = (await channelResponse.json()) as { name?: string; guild_id?: string };
                result.details!.channelName = channelData.name || 'Unknown';
                if (guildId && channelData.guild_id && channelData.guild_id !== guildId) {
                    result.errors.push(`Channel "${channelData.name}" does not belong to the specified guild. It belongs to a different server.`);
                    result.valid = false;
                }
            }
        } catch (error) {
            result.warnings.push(`Could not verify channel ID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return result;
}

async function validateTelegramCredentials(
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    const botToken = config.botToken?.trim();
    const allowedUsers = config.allowedUsers?.trim();

    if (!botToken) return { valid: false, errors: ['Bot token is required'], warnings: [] };
    if (!allowedUsers) return { valid: false, errors: ['At least one allowed user ID is required'], warnings: [] };

    try {
        const response = await proxyAwareFetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const data = (await response.json()) as { ok?: boolean; description?: string; result?: { username?: string } };
        if (data.ok) {
            return { valid: true, errors: [], warnings: [], details: { botUsername: data.result?.username || 'Unknown' } };
        }
        return { valid: false, errors: [data.description || 'Invalid bot token'], warnings: [] };
    } catch (error) {
        return { valid: false, errors: [`Connection error: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
    }
}

export async function validateChannelConfig(channelType: string): Promise<ValidationResult> {
    const { exec } = await import('child_process');
    const normalizedType = normalizeChannelType(channelType);

    const result: ValidationResult = { valid: true, errors: [], warnings: [] };

    try {
        const openclawPath = getOpenClawResolvedDir();

        // Run openclaw doctor command to validate config (async to avoid
        // blocking the main thread).
        const output = await new Promise<string>((resolve, reject) => {
            exec(
                `node openclaw.mjs doctor --json 2>&1`,
                {
                    cwd: openclawPath,
                    encoding: 'utf-8',
                    timeout: 30000,
                    windowsHide: true,
                },
                (err, stdout) => {
                    if (err) reject(err);
                    else resolve(stdout);
                },
            );
        });

        const lines = output.split('\n');
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes(normalizedType) && lowerLine.includes('error')) {
                result.errors.push(line.trim());
                result.valid = false;
            } else if (lowerLine.includes(normalizedType) && lowerLine.includes('warning')) {
                result.warnings.push(line.trim());
            } else if (lowerLine.includes('unrecognized key') && lowerLine.includes(normalizedType)) {
                result.errors.push(line.trim());
                result.valid = false;
            }
        }

        const config = await readOpenClawConfig();
        const storedConfig = getStoredChannelConfig(config, normalizedType);
        if (!storedConfig) {
            result.errors.push(`Channel ${normalizedType} is not configured`);
            result.valid = false;
        } else if (!storedConfig.enabled) {
            result.warnings.push(`Channel ${normalizedType} is disabled`);
        }

        if (normalizedType === 'discord') {
            const discordConfig = config.channels?.discord;
            if (!discordConfig?.token) {
                result.errors.push('Discord: Bot token is required');
                result.valid = false;
            }
        } else if (normalizedType === 'telegram') {
            const telegramConfig = config.channels?.telegram;
            if (!telegramConfig?.botToken) {
                result.errors.push('Telegram: Bot token is required');
                result.valid = false;
            }
            const allowedUsers = telegramConfig?.allowFrom as string[] | undefined;
            if (!allowedUsers || allowedUsers.length === 0) {
                result.errors.push('Telegram: Allowed User IDs are required');
                result.valid = false;
            }
        }

        if (result.errors.length === 0 && result.warnings.length === 0) {
            result.valid = true;
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('Unrecognized key') || errorMessage.includes('invalid config')) {
            result.errors.push(errorMessage);
            result.valid = false;
        } else if (errorMessage.includes('ENOENT')) {
            result.errors.push('OpenClaw not found. Please ensure OpenClaw is installed.');
            result.valid = false;
        } else {
            console.warn('Doctor command failed:', errorMessage);
            const config = await readOpenClawConfig();
            if (getStoredChannelConfig(config, normalizedType)) {
                result.valid = true;
            } else {
                result.errors.push(`Channel ${normalizedType} is not configured`);
                result.valid = false;
            }
        }
    }

    return result;
}
