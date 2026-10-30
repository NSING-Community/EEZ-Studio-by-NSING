// Example project storage.
//
// Three possible sources, tried in this order when a project is created:
//   1. network (raw.githubusercontent.com) - the historical behaviour;
//   2. user data cache (getUserDataPath("examples-cache")) - filled whenever a
//      download succeeds, so a machine that was online once keeps working;
//   3. bundled resources (resources/project-examples, shipped with the app) -
//      makes the curated examples usable on a permanently offline machine.
//
// The shared implementation lives in resource-storage.ts; this module only
// binds it to the examples directory and cache.
//
// This module must not import examples-catalog.ts or Wizard.tsx: both of them
// import from here, and circular imports are a real hazard in this codebase.

import {
    getBundledResourceDir,
    loadJsonResourceWithFallback,
    readBundledBuffer,
    readBundledJson,
    readCachedBuffer,
    readCachedJson,
    ResourceSource,
    writeCachedBuffer,
    writeCachedJson
} from "project-editor/store/resource-storage";

const EXAMPLES_BUNDLED_DIR = "project-examples";
// Hand-maintained examples (not fetched from upstream) live in their own dir so
// tools/fetch-project-resources.js can keep regenerating project-examples.
const CUSTOM_EXAMPLES_BUNDLED_DIR = "project-examples-custom";
const EXAMPLES_CACHE_DIR = "examples-cache";
const LOG_TAG = "[examples]";

export type ExampleProjectSource = ResourceSource;

export interface LoadedExampleProject {
    project: any;
    source: ExampleProjectSource;
}

export interface ExamplesCatalogVersion {
    lastModified: Date;
}

export function getBundledProjectExamplesDir() {
    return getBundledResourceDir(EXAMPLES_BUNDLED_DIR);
}

////////////////////////////////////////////////////////////////////////////////
// Bundled resources

export async function readBundledExamplesCatalog() {
    const catalog = await readBundledJson(
        EXAMPLES_BUNDLED_DIR,
        "examples-catalog.json",
        LOG_TAG
    );
    return Array.isArray(catalog) ? catalog : undefined;
}

export async function readBundledExamplesCatalogVersion(): Promise<
    ExamplesCatalogVersion | undefined
> {
    const version = await readBundledJson(
        EXAMPLES_BUNDLED_DIR,
        "examples-catalog-version.json",
        LOG_TAG
    );
    if (!version || !version.lastModified) {
        return undefined;
    }
    return { lastModified: new Date(version.lastModified) };
}

export async function readBundledCustomExamplesCatalog() {
    const catalog = await readBundledJson(
        CUSTOM_EXAMPLES_BUNDLED_DIR,
        "custom-examples.json",
        LOG_TAG
    );
    return Array.isArray(catalog) ? catalog : undefined;
}

export async function readBundledExampleProject(
    eezProjectPath: string | undefined
): Promise<any | undefined> {
    return (
        (await readBundledJson(
            EXAMPLES_BUNDLED_DIR,
            eezProjectPath,
            LOG_TAG
        )) ??
        (await readBundledJson(
            CUSTOM_EXAMPLES_BUNDLED_DIR,
            eezProjectPath,
            LOG_TAG
        ))
    );
}

export async function readBundledExampleResource(
    eezProjectPath: string | undefined,
    resourceFileRelativePath: string
): Promise<Buffer | undefined> {
    return (
        (await readBundledBuffer(
            EXAMPLES_BUNDLED_DIR,
            eezProjectPath,
            resourceFileRelativePath
        )) ??
        (await readBundledBuffer(
            CUSTOM_EXAMPLES_BUNDLED_DIR,
            eezProjectPath,
            resourceFileRelativePath
        ))
    );
}

////////////////////////////////////////////////////////////////////////////////
// User data cache

export async function readExampleProjectFromCache(
    url: string
): Promise<any | undefined> {
    return await readCachedJson(EXAMPLES_CACHE_DIR, url);
}

export async function writeExampleProjectToCache(url: string, text: string) {
    await writeCachedJson(EXAMPLES_CACHE_DIR, url, text, LOG_TAG);
}

export async function readExampleResourceFromCache(
    url: string
): Promise<Buffer | undefined> {
    return await readCachedBuffer(EXAMPLES_CACHE_DIR, url);
}

export async function writeExampleResourceToCache(url: string, data: Buffer) {
    await writeCachedBuffer(EXAMPLES_CACHE_DIR, url, data, LOG_TAG);
}

////////////////////////////////////////////////////////////////////////////////
// Load with fallback

export async function loadExampleProjectWithFallback(
    url: string,
    eezProjectPath: string | undefined
): Promise<LoadedExampleProject> {
    const { value, source } = await loadJsonResourceWithFallback({
        url,
        bundledDirName: EXAMPLES_BUNDLED_DIR,
        extraBundledDirNames: [CUSTOM_EXAMPLES_BUNDLED_DIR],
        cacheDirName: EXAMPLES_CACHE_DIR,
        bundledRelativePath: eezProjectPath,
        logTag: LOG_TAG
    });

    return { project: value, source };
}
