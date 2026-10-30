import { observable, runInAction, makeObservable } from "mobx";

import {
    getUserDataPath,
    fileExists,
    readJsObjectFromFile,
    writeJsObjectToFile
} from "eez-studio-shared/util-electron";

import * as notification from "eez-studio-ui/notification";

import { t } from "eez-studio-shared/i18n";

import type { ExampleProject } from "project-editor/project/ui/Wizard";

import {
    readBundledCustomExamplesCatalog,
    readBundledExamplesCatalog,
    readBundledExamplesCatalogVersion
} from "project-editor/store/examples-storage";

export const EEZ_PROJECT_EXAMPLES_REPOSITORY =
    "https://github.com/eez-open/eez-project-examples";

const CATALOG_VERSION_DOWNLOAD_URL =
    "https://github.com/eez-open/eez-project-examples/raw/master/build/catalog-version.json";

const CATALOG_DOWNLOAD_URL =
    "https://github.com/eez-open/eez-project-examples/raw/master/build/catalog.zip";

interface ICatalogVersion {
    lastModified: Date;
}

class ExamplesCatalog {
    catalogAtStart: ExampleProject[];

    catalog: ExampleProject[] = [];
    catalogVersion: ICatalogVersion;

    // True when the catalog was read from the copy bundled with the app instead
    // of the user data directory. Not observable on purpose: it only gates the
    // "failed to download catalog version" toast below.
    catalogLoadedFromBundled = false;

    // Hand-maintained examples bundled with the app; merged into every catalog
    // (including one downloaded from upstream) so they never disappear.
    private customExamples: ExampleProject[] | undefined;

    onNewCatalog: () => void | undefined;

    constructor() {
        makeObservable(this, {
            catalogAtStart: observable,
            catalog: observable
        });
    }

    async load() {
        try {
            const catalog = await this._loadCatalog();
            runInAction(() => {
                if (!this.catalogAtStart) {
                    this.catalogAtStart = catalog;
                }
                this.catalog = catalog;
            });
        } catch (error) {
            notification.error(
                t("Failed to load eez-project examples catalog ({error})", {
                    error: `${error}`
                })
            );
        }

        try {
            const catalogVersion = await this._loadCatalogVersion();
            runInAction(() => (this.catalogVersion = catalogVersion));
            this.checkNewVersionOfCatalog();
        } catch (error) {
            notification.error(t("Failed to load catalog version ({error})", { error }));
        }
    }

    get catalogPath() {
        return getUserDataPath("examples-catalog.json");
    }

    private async getCustomExamples(): Promise<ExampleProject[]> {
        if (!this.customExamples) {
            const custom = await readBundledCustomExamplesCatalog();
            this.customExamples = Array.isArray(custom)
                ? (custom as ExampleProject[]).map(example => ({
                      ...example,
                      custom: true
                  }))
                : [];
        }
        return this.customExamples;
    }

    // Drop every custom entry from the base catalog (including stale ones
    // persisted by an older build), then append the current bundled list.
    private mergeCustomExamples(catalog: ExampleProject[]): ExampleProject[] {
        const custom = this.customExamples ?? [];
        const key = (example: ExampleProject) =>
            `${example.repository}|${(example.eezProjectPath || "").replace(
                /\\/g,
                "/"
            )}`;
        const customKeys = new Set(custom.map(key));
        return [
            ...catalog.filter(
                example => !example.custom && !customKeys.has(key(example))
            ),
            ...custom
        ];
    }

    async _loadCatalog() {
        this.catalogLoadedFromBundled = false;
        await this.getCustomExamples();

        let catalogPath = this.catalogPath;
        if (await fileExists(catalogPath)) {
            try {
                return this.mergeCustomExamples(
                    (await readJsObjectFromFile(catalogPath)) as ExampleProject[]
                );
            } catch (error) {
                console.warn(
                    "Failed to read examples catalog, falling back to the bundled copy",
                    error
                );
            }
        }

        // A fresh (possibly offline) installation has no catalog in the user
        // data directory, but the app ships a seed with the curated examples.
        const bundledCatalog = await readBundledExamplesCatalog();
        if (bundledCatalog) {
            this.catalogLoadedFromBundled = true;
            return this.mergeCustomExamples(bundledCatalog as ExampleProject[]);
        }

        return this.mergeCustomExamples([] as ExampleProject[]);
    }

    get catalogVersionPath() {
        return getUserDataPath("examples-catalog-version.json");
    }

    async _loadCatalogVersion() {
        let catalogVersionPath = this.catalogVersionPath;
        if (await fileExists(catalogVersionPath)) {
            try {
                const catalogVersion = await readJsObjectFromFile(
                    catalogVersionPath
                );
                catalogVersion.lastModified = new Date(
                    catalogVersion.lastModified
                );
                return catalogVersion;
            } catch (err) {
                console.error(err);
            }
        }

        // Offline install: the version shipped next to the bundled catalog seed
        // keeps the "is there a newer catalog?" check meaningful.
        if (this.catalogLoadedFromBundled) {
            return await readBundledExamplesCatalogVersion();
        }

        return undefined;
    }

    async checkNewVersionOfCatalog() {
        try {
            const catalogVersion = await this.downloadCatalogVersion();

            if (
                !this.catalogVersion ||
                catalogVersion.lastModified > this.catalogVersion.lastModified
            ) {
                runInAction(() => (this.catalogVersion = catalogVersion));
                this.downloadCatalog();
            } else {
                // no new version
                return false;
            }
        } catch (error) {
            console.error(error);
            if (!this.catalogLoadedFromBundled) {
                // Offline machines that run on the bundled seed would otherwise
                // get this toast every time the Examples page is opened.
                notification.error(
                    t("Failed to download eez-project examples catalog version")
                );
            }
        }

        return true;
    }

    downloadCatalogVersion() {
        return new Promise<ICatalogVersion>((resolve, reject) => {
            var req = new XMLHttpRequest();
            req.responseType = "json";
            req.open("GET", CATALOG_VERSION_DOWNLOAD_URL);

            req.addEventListener("load", async () => {
                const catalogVersion = req.response;
                catalogVersion.lastModified = new Date(
                    catalogVersion.lastModified
                );
                await writeJsObjectToFile(
                    this.catalogVersionPath,
                    catalogVersion
                );
                resolve(catalogVersion);
            });

            req.addEventListener("error", error => {
                console.error(
                    "Failed to download catalog-version.json for eez-project examples",
                    error
                );
                reject(error);
            });

            req.send();
        });
    }

    downloadCatalog() {
        console.log("downloadCatalog");

        var req = new XMLHttpRequest();
        req.responseType = "arraybuffer";
        req.open("GET", CATALOG_DOWNLOAD_URL);

        const progressToastId = notification.info(
            t("Downloading eez-project examples catalog ..."),
            {
                autoClose: false,
                hideProgressBar: false
            }
        );

        req.addEventListener("progress", event => {
            notification.update(progressToastId, {
                render: event.total
                    ? t(
                          "Downloading eez-project examples catalog: {loaded} of {total}",
                          {
                              loaded: event.loaded,
                              total: event.total
                          }
                      )
                    : t(
                          "Downloading eez-project examples catalog: {loaded}",
                          {
                              loaded: event.loaded
                          }
                      )
            });
        });

        req.addEventListener("load", async () => {
            const decompress = require("decompress");

            const files = await decompress(Buffer.from(req.response));

            // The full upstream catalog supersedes the bundled seed, but the
            // hand-maintained examples must survive the refresh.
            await this.getCustomExamples();
            const catalog = this.mergeCustomExamples(JSON.parse(files[0].data));

            runInAction(() => {
                this.catalog = catalog;
            });

            this.catalogLoadedFromBundled = false;

            if (this.onNewCatalog) {
                this.onNewCatalog();
            }

            await writeJsObjectToFile(this.catalogPath, this.catalog);

            notification.update(progressToastId, {
                type: notification.SUCCESS,
                render: t("The latest eez-project examples catalog successfully downloaded."),
                autoClose: 5000
            });
        });

        req.addEventListener("error", error => {
            console.error("eez-project examples catalog download error", error);
            notification.update(progressToastId, {
                type: notification.ERROR,
                render: t("Failed to download eez-project examples catalog."),
                autoClose: 5000
            });
        });

        req.send();
    }
}

export const examplesCatalog = new ExamplesCatalog();
