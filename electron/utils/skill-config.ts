/**
 * Skill Config Utilities
 * Direct read/write access to skill configuration in ~/.openclaw/openclaw.json
 * This bypasses the Gateway RPC for faster and more reliable config updates.
 *
 * All file I/O uses async fs/promises to avoid blocking the main thread.
 */
import { readFile, writeFile, access, cp, mkdir, readdir, rename, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { constants } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getOpenClawDir } from './paths';
import { logger } from './logger';

const OPENCLAW_CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json');
const VENDOR_SKILLS_MANIFEST = '_clawx_vendor_skills.json';

interface SkillEntry {
    enabled?: boolean;
    apiKey?: string;
    env?: Record<string, string>;
}

interface OpenClawConfig {
    skills?: {
        entries?: Record<string, SkillEntry>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

async function fileExists(p: string): Promise<boolean> {
    try { await access(p, constants.F_OK); return true; } catch { return false; }
}

/**
 * Read the current OpenClaw config
 */
async function readConfig(): Promise<OpenClawConfig> {
    if (!(await fileExists(OPENCLAW_CONFIG_PATH))) {
        return {};
    }
    try {
        const raw = await readFile(OPENCLAW_CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Failed to read openclaw config:', err);
        return {};
    }
}

/**
 * Write the OpenClaw config
 */
async function writeConfig(config: OpenClawConfig): Promise<void> {
    const json = JSON.stringify(config, null, 2);
    await writeFile(OPENCLAW_CONFIG_PATH, json, 'utf-8');
}

/**
 * Get skill config
 */
export async function getSkillConfig(skillKey: string): Promise<SkillEntry | undefined> {
    const config = await readConfig();
    return config.skills?.entries?.[skillKey];
}

/**
 * Update skill config (apiKey and env)
 */
export async function updateSkillConfig(
    skillKey: string,
    updates: { apiKey?: string; env?: Record<string, string> }
): Promise<{ success: boolean; error?: string }> {
    try {
        const config = await readConfig();

        // Ensure skills.entries exists
        if (!config.skills) {
            config.skills = {};
        }
        if (!config.skills.entries) {
            config.skills.entries = {};
        }

        // Get or create skill entry
        const entry = config.skills.entries[skillKey] || {};

        // Update apiKey
        if (updates.apiKey !== undefined) {
            const trimmed = updates.apiKey.trim();
            if (trimmed) {
                entry.apiKey = trimmed;
            } else {
                delete entry.apiKey;
            }
        }

        // Update env
        if (updates.env !== undefined) {
            const newEnv: Record<string, string> = {};

            for (const [key, value] of Object.entries(updates.env)) {
                const trimmedKey = key.trim();
                if (!trimmedKey) continue;

                const trimmedVal = value.trim();
                if (trimmedVal) {
                    newEnv[trimmedKey] = trimmedVal;
                }
            }

            if (Object.keys(newEnv).length > 0) {
                entry.env = newEnv;
            } else {
                delete entry.env;
            }
        }

        // Save entry back
        config.skills.entries[skillKey] = entry;

        await writeConfig(config);
        return { success: true };
    } catch (err) {
        console.error('Failed to update skill config:', err);
        return { success: false, error: String(err) };
    }
}

/**
 * Get all skill configs (for syncing to frontend)
 */
export async function getAllSkillConfigs(): Promise<Record<string, SkillEntry>> {
    const config = await readConfig();
    return config.skills?.entries || {};
}

async function moveDirWithFallback(sourceDir: string, targetDir: string): Promise<void> {
    try {
        await rename(sourceDir, targetDir);
        return;
    } catch {
        await mkdir(targetDir, { recursive: true });
        await cp(sourceDir, targetDir, { recursive: true });
        await rm(sourceDir, { recursive: true, force: true });
    }
}

async function loadVendorSkillSlugs(sourceRoot: string): Promise<Set<string>> {
    const manifestPath = join(sourceRoot, VENDOR_SKILLS_MANIFEST);
    if (!existsSync(manifestPath)) {
        return new Set();
    }
    try {
        const raw = await readFile(manifestPath, 'utf-8');
        const parsed = JSON.parse(raw) as { skills?: unknown };
        if (!Array.isArray(parsed.skills)) {
            return new Set();
        }
        return new Set(
            parsed.skills
                .map((entry) => String(entry).trim())
                .filter(Boolean)
        );
    } catch (error) {
        logger.warn(`Failed to read vendor skills manifest: ${manifestPath}`, error);
        return new Set();
    }
}

async function migrateSkillsFromDir(sourceRoot: string, targetRoot: string, allowedSlugs: Set<string>): Promise<number> {
    if (!existsSync(sourceRoot)) {
        return 0;
    }
    if (allowedSlugs.size === 0) {
        return 0;
    }

    await mkdir(targetRoot, { recursive: true });
    let movedCount = 0;

    try {
        const dirents = await readdir(sourceRoot, { withFileTypes: true });

        for (const entry of dirents) {
            if (!entry.isDirectory()) {
                continue;
            }

            const slug = entry.name;
            if (!allowedSlugs.has(slug)) {
                continue; // keep non-vendor skills in source directory
            }
            const sourceDir = join(sourceRoot, slug);
            const sourceManifest = join(sourceDir, 'SKILL.md');
            if (!existsSync(sourceManifest)) {
                continue;
            }

            const targetDir = join(targetRoot, slug);
            const targetManifest = join(targetDir, 'SKILL.md');
            if (existsSync(targetManifest)) {
                await rm(sourceDir, { recursive: true, force: true });
                continue;
            }

            try {
                await moveDirWithFallback(sourceDir, targetDir);
                movedCount++;
                logger.info(`Migrated bundled skill: ${slug} -> ${targetDir}`);
            } catch (error) {
                logger.warn(`Failed to migrate bundled skill ${slug}:`, error);
            }
        }

    } catch (error) {
        logger.warn(`Failed to migrate bundled skills from ${sourceRoot}:`, error);
    }

    return movedCount;
}

/**
 * Ensure bundled skills are migrated to ~/.openclaw/skills/<slug>/.
 * Only skills listed by <openclaw>/skills/_clawx_vendor_skills.json
 * (generated during bundle from vendor/openclaw-skills) are migrated.
 * Other source skills remain in place.
 */
export async function ensureBuiltinSkillsInstalled(): Promise<void> {
    const skillsRoot = join(homedir(), '.openclaw', 'skills');
    const openclawDir = getOpenClawDir();

    const primarySource = join(openclawDir, 'skills');
    const vendorSkillSlugs = await loadVendorSkillSlugs(primarySource);

    const installedFromPrimary = await migrateSkillsFromDir(primarySource, skillsRoot, vendorSkillSlugs);

    logger.info(
        `Bundled vendor skills migration finished: moved=${installedFromPrimary}, totalVendor=${vendorSkillSlugs.size}, target=${skillsRoot}`
    );
}
