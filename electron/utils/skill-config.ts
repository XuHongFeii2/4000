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
const VENDOR_SKILL_MARKER = '.clawx_vendor_skill';

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

function hasSkillManifest(dirPath: string): boolean {
    return existsSync(join(dirPath, 'SKILL.md')) || existsSync(join(dirPath, 'skill.md'));
}

async function removeDirRobust(dirPath: string): Promise<boolean> {
    try {
        await rm(dirPath, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
        });
        return !existsSync(dirPath);
    } catch {
        return false;
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

async function loadVendorSkillSlugsFromMarker(sourceRoot: string): Promise<Set<string>> {
    const result = new Set<string>();
    if (!existsSync(sourceRoot)) {
        return result;
    }
    try {
        const dirents = await readdir(sourceRoot, { withFileTypes: true });
        for (const entry of dirents) {
            if (!entry.isDirectory()) continue;
            const markerPath = join(sourceRoot, entry.name, VENDOR_SKILL_MARKER);
            if (existsSync(markerPath)) {
                result.add(entry.name);
            }
        }
    } catch (error) {
        logger.warn(`Failed to scan vendor skill markers from ${sourceRoot}:`, error);
    }
    return result;
}

async function migrateSkillsFromDir(sourceRoot: string, targetRoot: string, allowedSlugs: Set<string>): Promise<number> {
    if (!existsSync(sourceRoot)) {
        logger.info(`[skills][migrate] source not found: ${sourceRoot}`);
        return 0;
    }
    if (allowedSlugs.size === 0) {
        logger.info(`[skills][migrate] no vendor skills detected, skip migration from: ${sourceRoot}`);
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
            if (!hasSkillManifest(sourceDir)) {
                continue;
            }

            const targetDir = join(targetRoot, slug);
            if (hasSkillManifest(targetDir)) {
                const removed = await removeDirRobust(sourceDir);
                logger.info(`[skills][migrate] duplicate source cleanup: slug=${slug}, removed=${removed}`);
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

        // Safety cleanup: if target already has this vendor skill, ensure source copy is removed.
        for (const slug of allowedSlugs) {
            const sourceDir = join(sourceRoot, slug);
            if (!existsSync(sourceDir)) continue;

            const targetDir = join(targetRoot, slug);
            if (!hasSkillManifest(targetDir)) continue;

            try {
                const removed = await removeDirRobust(sourceDir);
                logger.info(`[skills][migrate] post-cleanup: slug=${slug}, removed=${removed}`);
            } catch (error) {
                logger.warn(`Failed to remove duplicated bundled source skill ${slug}:`, error);
            }
        }

    } catch (error) {
        logger.warn(`Failed to migrate bundled skills from ${sourceRoot}:`, error);
    }

    return movedCount;
}

/**
 * Ensure bundled skills are migrated to ~/.openclaw/skills/<slug>/.
 * Only vendor skills are migrated, resolved by:
 * 1) <openclaw>/skills/_clawx_vendor_skills.json
 * 2) per-skill marker file: <openclaw>/skills/<slug>/.clawx_vendor_skill
 * (both generated during bundle from vendor/openclaw-skills).
 * Other source skills remain in place.
 */
export async function ensureBuiltinSkillsInstalled(): Promise<void> {
    const skillsRoot = join(homedir(), '.openclaw', 'skills');
    const openclawDir = getOpenClawDir();

    const primarySource = join(openclawDir, 'skills');
    const vendorSkillSlugs = await loadVendorSkillSlugs(primarySource);
    const markerSkillSlugs = await loadVendorSkillSlugsFromMarker(primarySource);
    const effectiveVendorSkillSlugs = new Set<string>([
        ...Array.from(vendorSkillSlugs),
        ...Array.from(markerSkillSlugs),
    ]);

    logger.info(
        `[skills][migrate] vendor slug sources manifest=${vendorSkillSlugs.size}, marker=${markerSkillSlugs.size}, effective=${effectiveVendorSkillSlugs.size}`,
    );
    logger.info(`[skills][migrate] has 图片视频生成=${effectiveVendorSkillSlugs.has('图片视频生成')}`);
    logger.info(`[skills][migrate] vendor slugs=${Array.from(effectiveVendorSkillSlugs).sort().join(', ') || '(empty)'}`);
    const debugSlug = '图片视频生成';
    const debugSourceDir = join(primarySource, debugSlug);
    const debugTargetDir = join(skillsRoot, debugSlug);
    logger.info(
        `[skills][migrate] debug slug=${debugSlug}, sourceExists=${existsSync(debugSourceDir)}, sourceHasManifest=${hasSkillManifest(debugSourceDir)}, targetExists=${existsSync(debugTargetDir)}, targetHasManifest=${hasSkillManifest(debugTargetDir)}`,
    );
    try {
        console.log('[skills][migrate][debug]', {
            sourceRoot: primarySource,
            targetRoot: skillsRoot,
            vendorSkillSlugs: Array.from(effectiveVendorSkillSlugs).sort(),
            debugSlug,
            sourceExists: existsSync(debugSourceDir),
            sourceHasManifest: hasSkillManifest(debugSourceDir),
            targetExists: existsSync(debugTargetDir),
            targetHasManifest: hasSkillManifest(debugTargetDir),
        });
    } catch {}

    const installedFromPrimary = await migrateSkillsFromDir(primarySource, skillsRoot, effectiveVendorSkillSlugs);

    logger.info(
        `[skills][migrate] debug-after slug=${debugSlug}, sourceExists=${existsSync(debugSourceDir)}, targetExists=${existsSync(debugTargetDir)}`,
    );

    logger.info(
        `Bundled vendor skills migration finished: moved=${installedFromPrimary}, totalVendor=${effectiveVendorSkillSlugs.size}, target=${skillsRoot}`
    );
}
