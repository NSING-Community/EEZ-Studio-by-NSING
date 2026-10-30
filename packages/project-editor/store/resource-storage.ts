// Shared storage for resources that can be fetched from the network, cached in
// the user data directory and bundled with the app.
//
// Three possible sources, tried in this order:
//   1. network - the historical behaviour;
//   2. user data cache (getUserDataPath(cacheDirName)) - filled whenever a
//      download succeeds, so a machine that was online once keeps working;
//   3. bundled resources (resources/<dirName>, shipped with the app) - makes
//      them usable on a permanently offline machine.
//
// This module must not import examples-storage.ts, templates-storage.ts,
// examples-catalog.ts or Wizard.tsx: they all import from here, and circular
// imports are a real hazard in this codebase.

import fs from "fs";
import path from "path";
import { createHash } from "crypto";

import { getUserDataPath, isDev } from "eez-studio-shared/util-electron";
import { sourceRootDir } from "eez-studio-shared/util";

export type ResourceSource = "network" | "cache" | "bundled";

export interface LoadedJsonResource {
    value: any;
    source: ResourceSource;
}

////////////////////////////////////////////////////////////////////////////////
// Bundled resources

export function getBundledResourceDir(dirName: string) {
    // Same dev/packaged split as project-editor/flow/expression/parser.ts.
    return isDev
        ? path.resolve(sourceRootDir(), "../resources", dirName)
        : path.join(process.resourcesPath!, dirName);
}

export function toSafeRelativePath(relativePath: string) {
    if (!relativePath || relativePath.includes("\0")) {
        return undefined;
    }
    const normalized = relativePath.replace(/\\/g, "/");
    if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
        return undefined;
    }
    const parts = normalized.split("/");
    if (parts.some(part => part === "" || part === "." || part === "..")) {
        return undefined;
    }
    return normalized;
}

export function resolveInside(root: string, relativePath: string) {
    const target = path.resolve(root, relativePath);
    if (!target.startsWith(root + path.sep)) {
        return undefined;
    }
    return target;
}

export async function readJsonFile(filePath: string) {
    try {
        return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
    } catch (error) {
        return undefined;
    }
}

export async function readBufferFile(filePath: string) {
    try {
        return await fs.promises.readFile(filePath);
    } catch (error) {
        return undefined;
    }
}

export async function readBundledJson(
    dirName: string,
    relativePath: string | undefined,
    logTag = "[resources]"
): Promise<any | undefined> {
    if (!relativePath) {
        return undefined;
    }
    const safeRelativePath = toSafeRelativePath(relativePath);
    if (!safeRelativePath) {
        console.warn(logTag, "unsafe bundled path", relativePath);
        return undefined;
    }
    const filePath = resolveInside(
        getBundledResourceDir(dirName),
        safeRelativePath
    );
    if (!filePath) {
        console.warn(logTag, "bundled path escapes root", safeRelativePath);
        return undefined;
    }
    return await readJsonFile(filePath);
}

// Resolve a resource file relative to the directory of the project file it
// belongs to (resourceFiles in the examples catalog are project-relative).
export async function readBundledBuffer(
    dirName: string,
    projectRelativePath: string | undefined,
    resourceRelativePath: string
): Promise<Buffer | undefined> {
    if (!projectRelativePath) {
        return undefined;
    }
    const safeProjectRelativePath = toSafeRelativePath(projectRelativePath);
    const safeResourceRelativePath = toSafeRelativePath(resourceRelativePath);
    if (!safeProjectRelativePath || !safeResourceRelativePath) {
        return undefined;
    }
    const joinedRelativePath = toSafeRelativePath(
        path.posix.join(
            path.posix.dirname(safeProjectRelativePath),
            safeResourceRelativePath
        )
    );
    if (!joinedRelativePath) {
        return undefined;
    }
    const filePath = resolveInside(
        getBundledResourceDir(dirName),
        joinedRelativePath
    );
    if (!filePath) {
        return undefined;
    }
    return await readBufferFile(filePath);
}

////////////////////////////////////////////////////////////////////////////////
// User data cache

function getCacheFilePath(
    cacheDirName: string,
    url: string,
    extension: ".json" | ".bin"
) {
    const hash = createHash("sha256").update(url).digest("hex");
    return path.join(getUserDataPath(cacheDirName), hash + extension);
}

// Cache writes must never break project creation, so failures are only logged.
export async function writeFileAtomic(
    filePath: string,
    data: string | Buffer,
    logTag = "[resources]"
) {
    let tempPath: string | undefined;
    try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(tempPath, data);
        await fs.promises.rename(tempPath, filePath);
    } catch (error) {
        console.warn(logTag, "failed to write cache file", filePath, error);
        if (tempPath) {
            try {
                await fs.promises.unlink(tempPath);
            } catch (err) {
                // ignore
            }
        }
    }
}

export async function readCachedJson(
    cacheDirName: string,
    url: string
): Promise<any | undefined> {
    return await readJsonFile(getCacheFilePath(cacheDirName, url, ".json"));
}

export async function writeCachedJson(
    cacheDirName: string,
    url: string,
    text: string,
    logTag = "[resources]"
) {
    await writeFileAtomic(
        getCacheFilePath(cacheDirName, url, ".json"),
        text,
        logTag
    );
}

export async function readCachedBuffer(
    cacheDirName: string,
    url: string
): Promise<Buffer | undefined> {
    return await readBufferFile(getCacheFilePath(cacheDirName, url, ".bin"));
}

export async function writeCachedBuffer(
    cacheDirName: string,
    url: string,
    data: Buffer,
    logTag = "[resources]"
) {
    await writeFileAtomic(
        getCacheFilePath(cacheDirName, url, ".bin"),
        data,
        logTag
    );
}

////////////////////////////////////////////////////////////////////////////////
// Load with fallback

export async function loadJsonResourceWithFallback(options: {
    url: string;
    bundledDirName: string;
    extraBundledDirNames?: string[];
    cacheDirName: string;
    bundledRelativePath: string | undefined;
    logTag: string;
}): Promise<LoadedJsonResource> {
    const {
        url,
        bundledDirName,
        extraBundledDirNames,
        cacheDirName,
        bundledRelativePath,
        logTag
    } = options;

    let networkError: any;

    try {
        const response = await fetch(url, { cache: "reload" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const text = await response.text();
        const value = JSON.parse(text);
        await writeCachedJson(cacheDirName, url, text, logTag);
        return { value, source: "network" };
    } catch (error) {
        networkError = error;
    }

    const cachedValue = await readCachedJson(cacheDirName, url);
    if (cachedValue) {
        console.info(`${logTag} loaded from cache:`, url);
        return { value: cachedValue, source: "cache" };
    }

    for (const dirName of [
        bundledDirName,
        ...(extraBundledDirNames ?? [])
    ]) {
        const bundledValue = await readBundledJson(
            dirName,
            bundledRelativePath,
            logTag
        );
        if (bundledValue) {
            console.info(
                `${logTag} loaded from bundled resources:`,
                dirName,
                bundledRelativePath
            );
            return { value: bundledValue, source: "bundled" };
        }
    }

    throw networkError;
}
