// Built-in project template storage.
//
// Same three-tier fallback as examples-storage.ts: network, then the user data
// cache, then the copy bundled under resources/project-templates. This is what
// lets a permanently offline machine create an LVGL project.
//
// The cache lives in its own directory (userData/templates-cache) so it is not
// confused with the examples cache.

import {
    loadJsonResourceWithFallback,
    readBundledJson,
    ResourceSource
} from "project-editor/store/resource-storage";

const TEMPLATES_BUNDLED_DIR = "project-templates";
const TEMPLATES_CACHE_DIR = "templates-cache";
const LOG_TAG = "[templates]";

export interface LoadedProjectTemplate {
    project: any;
    source: ResourceSource;
}

export async function readBundledProjectTemplate(
    relativePath: string | undefined
): Promise<any | undefined> {
    return await readBundledJson(
        TEMPLATES_BUNDLED_DIR,
        relativePath,
        LOG_TAG
    );
}

export async function loadProjectTemplateWithFallback(
    url: string,
    bundledRelativePath: string | undefined
): Promise<LoadedProjectTemplate> {
    const { value, source } = await loadJsonResourceWithFallback({
        url,
        bundledDirName: TEMPLATES_BUNDLED_DIR,
        cacheDirName: TEMPLATES_CACHE_DIR,
        bundledRelativePath,
        logTag: LOG_TAG
    });

    return { project: value, source };
}
