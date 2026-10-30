import { observable, runInAction, makeObservable } from "mobx";

import {
    getUserDataPath,
    fileExists,
    readJsObjectFromFile,
    writeJsObjectToFile
} from "eez-studio-shared/util-electron";

import * as notification from "eez-studio-ui/notification";
import { t } from "eez-studio-shared/i18n";

import { IExtension } from "eez-studio-shared/extensions/extension";

export const DEFAULT_EXTENSIONS_CATALOG_VERSION_DOWNLOAD_URL =
    "https://github.com/eez-open/studio-extensions/raw/master/build/catalog-version.json";

export const DEFAULT_EXTENSIONS_CATALOG_DOWNLOAD_URL =
    "https://github.com/eez-open/studio-extensions/raw/master/build/catalog.zip";

// 【定制】启动时是否联网检查扩展目录的新版本。
// 扩展页与仪器页都已隐藏（见 home-tab.tsx 的【定制】注释），extensionsCatalog 目前没有
// 可见的消费者；而这个检查在 github.com 不可达时会每次启动弹一条
// "Failed to download extensions catalog version"。恢复：改为 true。
// 本地 catalog.json 的读取（_loadCatalog / _loadCatalogVersion）不受影响。
// 手动「检查更新」按钮走 extensions-manager.tsx 里的 forceDownload 分支，也不受影响。
const CHECK_EXTENSIONS_CATALOG_VERSION = false;

interface ICatalogVersion {
    lastModified: Date;
}

class ExtensionsCatalog {
    catalog: IExtension[] = [];
    catalogVersion: ICatalogVersion;

    constructor() {
        makeObservable(this, {
            catalog: observable
        });
    }

    load() {
        this._loadCatalog()
            .then(catalog => {
                runInAction(() => (this.catalog = catalog));
            })
            .catch(error =>
                notification.error(
                    t("Failed to load extensions catalog ({error})", {
                        error: `${error}`
                    })
                )
            );

        this._loadCatalogVersion()
            .then(catalogVersion => {
                runInAction(() => (this.catalogVersion = catalogVersion));

                // 【定制】见 CHECK_EXTENSIONS_CATALOG_VERSION
                if (CHECK_EXTENSIONS_CATALOG_VERSION) {
                    this.checkNewVersionOfCatalog();
                }
            })
            .catch(error =>
                notification.error(
                    t("Failed to load catalog version ({error})", {
                        error: `${error}`
                    })
                )
            );
    }

    get catalogPath() {
        return getUserDataPath("catalog.json");
    }

    async _loadCatalog() {
        let catalogPath = this.catalogPath;
        if (!(await fileExists(catalogPath))) {
            return [];
        }
        return (await readJsObjectFromFile(catalogPath)) as IExtension[];
    }

    get catalogVersionPath() {
        return getUserDataPath("catalog-version.json");
    }

    async _loadCatalogVersion() {
        let catalogVersion;

        let catalogVersionPath = this.catalogVersionPath;
        if (await fileExists(catalogVersionPath)) {
            try {
                catalogVersion = await readJsObjectFromFile(catalogVersionPath);
                catalogVersion.lastModified = new Date(
                    catalogVersion.lastModified
                );
            } catch (err) {
                console.error(err);
            }
        }

        return catalogVersion;
    }

    async checkNewVersionOfCatalog(forceDownload: boolean = false) {
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
                if (forceDownload) {
                    this.downloadCatalog();
                    return true;
                }
                return false;
            }
        } catch (error) {
            console.error(error);
            notification.error(t("Failed to download extensions catalog version"));
        }

        return true;
    }

    downloadCatalogVersion() {
        return new Promise<ICatalogVersion>((resolve, reject) => {
            var req = new XMLHttpRequest();
            req.responseType = "json";
            req.open("GET", DEFAULT_EXTENSIONS_CATALOG_VERSION_DOWNLOAD_URL);

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
                    "Failed to download catalog-version.json for extensions",
                    error
                );
                reject(error);
            });

            req.send();
        });
    }

    downloadCatalog() {
        var req = new XMLHttpRequest();
        req.responseType = "arraybuffer";
        req.open("GET", DEFAULT_EXTENSIONS_CATALOG_DOWNLOAD_URL);

        const progressToastId = notification.info(
            t("Downloading extensions catalog ..."),
            {
                autoClose: false,
                hideProgressBar: false
            }
        );

        req.addEventListener("progress", event => {
            notification.update(progressToastId, {
                render: event.total
                    ? t("Downloading extensions catalog: {loaded} of {total}", {
                          loaded: event.loaded,
                          total: event.total
                      })
                    : t("Downloading extensions catalog: {loaded}", {
                          loaded: event.loaded
                      })
            });
        });

        req.addEventListener("load", async () => {
            const decompress = require("decompress");

            const files = await decompress(Buffer.from(req.response));

            const catalog = JSON.parse(files[0].data);

            runInAction(() => (this.catalog = catalog));

            await writeJsObjectToFile(this.catalogPath, this.catalog);

            notification.update(progressToastId, {
                type: notification.SUCCESS,
                render: t("The latest extensions catalog successfully downloaded."),
                autoClose: 5000
            });
        });

        req.addEventListener("error", error => {
            console.error("ExtensionsCatalog download error", error);
            notification.update(progressToastId, {
                type: notification.ERROR,
                render: t("Failed to download extensions catalog."),
                autoClose: 5000
            });
        });

        req.send();
    }
}

export const extensionsCatalog = new ExtensionsCatalog();
