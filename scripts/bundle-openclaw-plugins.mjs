#!/usr/bin/env zx

/**
 * Build self-contained OpenClaw plugin mirrors for packaging.
 *
 * Outputs:
 *   - @soimy/dingtalk -> build/openclaw-plugins/dingtalk
 *   - vendor/EasyClaw-Plugin -> build/openclaw-plugins/easyclaw
 */

import 'zx/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT, 'build', 'openclaw-plugins');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const LOCAL_EASYCLAW_PLUGIN_DIR = path.join(ROOT, 'vendor', 'EasyClaw-Plugin');

function normWin(p) {
  if (process.platform !== 'win32') return p;
  if (p.startsWith('\\\\?\\')) return p;
  return '\\\\?\\' + p.replace(/\//g, '\\');
}

const PLUGINS = [
  { kind: 'npm', npmName: '@soimy/dingtalk', pluginId: 'dingtalk' },
  { kind: 'local', sourceDir: LOCAL_EASYCLAW_PLUGIN_DIR, pluginId: 'easyclaw' },
];

function getVirtualStoreNodeModules(realPkgPath) {
  let dir = realPkgPath;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === 'node_modules') return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function listPackages(nodeModulesDir) {
  const result = [];
  const normalizedDir = normWin(nodeModulesDir);
  if (!fs.existsSync(normalizedDir)) return result;

  for (const entry of fs.readdirSync(normalizedDir)) {
    if (entry === '.bin') continue;

    const entryPath = path.join(nodeModulesDir, entry);
    if (entry.startsWith('@')) {
      let scopeEntries = [];
      try {
        scopeEntries = fs.readdirSync(normWin(entryPath));
      } catch {
        continue;
      }

      for (const sub of scopeEntries) {
        result.push({
          name: `${entry}/${sub}`,
          fullPath: path.join(entryPath, sub),
        });
      }
      continue;
    }

    result.push({ name: entry, fullPath: entryPath });
  }

  return result;
}

function bundlePackageDependencies(outputDir, dependencyNames = [], peerDependencyNames = []) {
  const collected = new Map();
  const skipPackages = new Set(['typescript', '@playwright/test', ...peerDependencyNames]);
  const skipScopes = ['@types/'];

  const collectDependency = (dependencyName) => {
    if (skipPackages.has(dependencyName) || skipScopes.some((scope) => dependencyName.startsWith(scope))) {
      return;
    }

    const dependencyPath = path.join(NODE_MODULES, ...dependencyName.split('/'));
    if (!fs.existsSync(dependencyPath)) {
      throw new Error(`Missing dependency "${dependencyName}". Run pnpm install first.`);
    }

    const realDependencyPath = fs.realpathSync(normWin(dependencyPath));
    if (collected.has(realDependencyPath)) {
      return;
    }

    collected.set(realDependencyPath, dependencyName);

    const packageJsonPath = path.join(realDependencyPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const childDependencies = Object.keys(packageJson.dependencies || {});
    const optionalDependencies = Object.keys(packageJson.optionalDependencies || {});

    for (const childDependency of [...childDependencies, ...optionalDependencies]) {
      collectDependency(childDependency);
    }
  };

  for (const dependencyName of dependencyNames) {
    collectDependency(dependencyName);
  }

  const outputNodeModules = path.join(outputDir, 'node_modules');
  fs.mkdirSync(outputNodeModules, { recursive: true });

  let copiedCount = 0;

  for (const [realPath, packageName] of collected) {
    const destination = path.join(outputNodeModules, packageName);
    try {
      fs.mkdirSync(normWin(path.dirname(destination)), { recursive: true });
      fs.cpSync(normWin(realPath), normWin(destination), { recursive: true, dereference: true });
      copiedCount++;
    } catch (error) {
      echo`Skipped dep ${packageName}: ${error.message}`;
    }
  }

  return { copiedCount, skippedDupes: 0 };
}

function ensurePluginManifest(outputDir, pluginId) {
  const manifestPath = path.join(outputDir, 'openclaw.plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing openclaw.plugin.json in bundled plugin output: ${pluginId}`);
  }
}

function bundleNpmPlugin({ npmName, pluginId }) {
  const pkgPath = path.join(NODE_MODULES, ...npmName.split('/'));
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Missing dependency "${npmName}". Run pnpm install first.`);
  }

  const realPluginPath = fs.realpathSync(normWin(pkgPath));
  const outputDir = path.join(OUTPUT_ROOT, pluginId);

  echo`Bundling npm plugin ${npmName} -> ${outputDir}`;

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  fs.cpSync(realPluginPath, outputDir, { recursive: true, dereference: true });

  const collected = new Map();
  const queue = [];
  const rootVirtualNM = getVirtualStoreNodeModules(realPluginPath);
  if (!rootVirtualNM) {
    throw new Error(`Cannot resolve virtual store node_modules for ${npmName}`);
  }
  queue.push({ nodeModulesDir: rootVirtualNM, skipPkg: npmName });

  const skipPackages = new Set(['typescript', '@playwright/test']);
  const skipScopes = ['@types/'];
  try {
    const pluginPkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf8'));
    for (const peer of Object.keys(pluginPkg.peerDependencies || {})) {
      skipPackages.add(peer);
    }
  } catch {
    // Ignore malformed package metadata in the mirror source.
  }

  while (queue.length > 0) {
    const { nodeModulesDir, skipPkg } = queue.shift();
    for (const { name, fullPath } of listPackages(nodeModulesDir)) {
      if (name === skipPkg) continue;
      if (skipPackages.has(name) || skipScopes.some((scope) => name.startsWith(scope))) continue;

      let realPath;
      try {
        realPath = fs.realpathSync(normWin(fullPath));
      } catch {
        continue;
      }

      if (collected.has(realPath)) continue;
      collected.set(realPath, name);

      const depVirtualNM = getVirtualStoreNodeModules(realPath);
      if (depVirtualNM && depVirtualNM !== nodeModulesDir) {
        queue.push({ nodeModulesDir: depVirtualNM, skipPkg: name });
      }
    }
  }

  const outputNodeModules = path.join(outputDir, 'node_modules');
  fs.mkdirSync(outputNodeModules, { recursive: true });

  let copiedCount = 0;
  let skippedDupes = 0;
  const copiedNames = new Set();

  for (const [realPath, pkgName] of collected) {
    if (copiedNames.has(pkgName)) {
      skippedDupes++;
      continue;
    }
    copiedNames.add(pkgName);

    const dest = path.join(outputNodeModules, pkgName);
    try {
      fs.mkdirSync(normWin(path.dirname(dest)), { recursive: true });
      fs.cpSync(normWin(realPath), normWin(dest), { recursive: true, dereference: true });
      copiedCount++;
    } catch (error) {
      echo`Skipped dep ${pkgName}: ${error.message}`;
    }
  }

  ensurePluginManifest(outputDir, pluginId);
  echo`Ready ${pluginId}: copied ${copiedCount} deps (skipped dupes: ${skippedDupes})`;
}

function bundleLocalPlugin({ sourceDir, pluginId }) {
  const resolvedSourceDir = path.resolve(sourceDir);
  if (!fs.existsSync(resolvedSourceDir)) {
    throw new Error(`Missing local plugin source "${resolvedSourceDir}".`);
  }

  const outputDir = path.join(OUTPUT_ROOT, pluginId);
  echo`Bundling local plugin ${resolvedSourceDir} -> ${outputDir}`;

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.cpSync(resolvedSourceDir, outputDir, { recursive: true, dereference: true });

  const pluginPkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf8'));
  const { copiedCount, skippedDupes } = bundlePackageDependencies(
    outputDir,
    Object.keys(pluginPkg.dependencies || {}),
    Object.keys(pluginPkg.peerDependencies || {}),
  );

  ensurePluginManifest(outputDir, pluginId);
  echo`Ready ${pluginId}: copied ${copiedCount} deps (skipped dupes: ${skippedDupes})`;
}

echo`Bundling OpenClaw plugin mirrors...`;
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

for (const plugin of PLUGINS) {
  if (plugin.kind === 'npm') {
    bundleNpmPlugin(plugin);
  } else {
    bundleLocalPlugin(plugin);
  }
}

echo`Plugin mirrors ready: ${OUTPUT_ROOT}`;
