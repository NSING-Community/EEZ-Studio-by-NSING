/// <reference path="./globals.d.ts"/>
import "bootstrap";
import { ipcRenderer } from "electron";
import React from "react";
import { createRoot } from "react-dom/client";
import { configure } from "mobx";
import { observer } from "mobx-react";

import { loadExtensions } from "eez-studio-shared/extensions/extensions";
import { getNodeModuleFolders } from "eez-studio-shared/extensions/yarn";

import * as notification from "eez-studio-ui/notification";
// 【定制】暂时隐藏关于页。恢复时取消本注释。
// import { showAboutBox } from "eez-studio-ui/about-box";

import type * as ImportInstrumentDefinitionModule from "instrument/import-instrument-definition";

import { handleDragAndDrop } from "home/drag-and-drop";
import { loadTabs, ProjectEditorTab, tabs } from "home/tabs-store";
import { settingsController } from "home/settings";
import { App } from "home/app";
import { openProject } from "home/tabs-store";

import { LineMarkers } from "project-editor/flow/connection-line/ConnectionLineComponent";

import "home/settings";
import { extensionsCatalog } from "./extensions-manager/catalog";
import { buildProject } from "home/build-project";
import { layoutModels } from "eez-studio-ui/side-dock";

configure({ enforceActions: "observed", useProxies: "always" });

// make sure we store all the values waiting to be stored inside blur event handler
// 将焦点从当前元素移开（用于触发输入框失焦提交）。
function blurAll() {
    var tmp = document.createElement("input");
    document.body.appendChild(tmp);
    tmp.focus();
    document.body.removeChild(tmp);
}

// 关闭应用前的清理：依次通知各 tab 保存状态、卸载扩展、持久化布局。
async function beforeAppClose() {
    blurAll();

    for (const tab of tabs.tabs) {
        if (tab.beforeAppClose) {
            if (!(await tab.beforeAppClose())) {
                return false;
            }
        }
    }

    const {
        destroyExtensions
    } = require("eez-studio-shared/extensions/extensions");
    destroyExtensions();

    layoutModels.saveToLocalStorage();

    return true;
}

ipcRenderer.on("beforeClose", async () => {
    if (await beforeAppClose()) {
        ipcRenderer.send("readyToClose");
    }
});

ipcRenderer.on("reload", async () => {
    if (await beforeAppClose()) {
        ipcRenderer.send("reload");
    }
});

ipcRenderer.on("switch-theme", async () => {
    settingsController.switchTheme(!settingsController.isDarkTheme);
});

ipcRenderer.on(
    "importInstrumentDefinitionFile",
    (sender: any, filePath: string) => {
        const { importInstrumentDefinition } =
            require("instrument/import-instrument-definition") as typeof ImportInstrumentDefinitionModule;
        importInstrumentDefinition(filePath);
    }
);

// 【定制】暂时隐藏关于页。恢复时取消本注释。
// ipcRenderer.on("show-about-box", async () => {
//     showAboutBox();
// });

ipcRenderer.on(
    "open-project",
    async (sender: any, filePath: any, runMode: boolean) => {
        openProject(filePath, runMode);
    }
);

ipcRenderer.on(
    "build-project",
    async (sender: any, filePath: any, runMode: boolean) => {
        buildProject(filePath);
    }
);

ipcRenderer.on("load-debug-info", async (sender: any, filePath: any) => {
    try {
        let tab = tabs.activeTab;
        if (tab instanceof ProjectEditorTab) {
            tab.loadDebugInfo(filePath);
        }
    } catch (err) {
        console.error(err);
    }
});

ipcRenderer.on("save-debug-info", () => {
    try {
        let tab = tabs.activeTab;
        if (tab instanceof ProjectEditorTab) {
            tab.saveDebugInfo();
        }
    } catch (err) {
        console.error(err);
    }
});

ipcRenderer.on("new-project", async (sender: any, filePath: any) => {
    const { showNewProjectWizard } = await import(
        "project-editor/project/ui/Wizard"
    );
    showNewProjectWizard();
});

ipcRenderer.on("add-instrument", async (sender: any, filePath: any) => {
    const { showAddInstrumentDialog } = await import(
        "instrument/add-instrument-dialog"
    );

    const { defaultInstrumentsStore } = await import("home/instruments");

    showAddInstrumentDialog(instrumentId => {
        setTimeout(() => {
            defaultInstrumentsStore.selectedInstrumentId = instrumentId;
        }, 100);
    });
});

// 首页渲染进程应用主体：挂载子内容与通知容器。
const Main = observer(
    class Main extends React.Component<{ children: React.ReactNode }> {
        render() {
            return (
                <>
                    {this.props.children}
                    {notification.container}
                </>
            );
        }
    }
);

// 渲染进程启动入口：加载翻译、挂载 UI、注册全局 IPC 处理。
async function main() {
    // 加载界面翻译字典
    const { loadDictionaries } = require("eez-studio-shared/i18n");
    loadDictionaries();

    const params = new URLSearchParams(location.search);
    const buildProject = params.get("build-project") === "1";

    if (!buildProject) {
        // 先挂载首页 UI，避免首屏被扩展加载（磁盘扫描 + 逐扩展 require）阻塞
        loadTabs();

        const root = createRoot(document.getElementById("EezStudio_Content")!);
        root.render(
            <Main>
                <App />
                <LineMarkers />
            </Main>
        );

        handleDragAndDrop();
    }

    // 扩展在后台加载，不阻塞首屏渲染。扩展就绪后再加载扩展目录数据、打开命令行传入的项目。
    async function finishStartup() {
        extensionsCatalog.load();
        ipcRenderer.send("open-command-line-project");
    }

    let nodeModuleFolders: string[];
    try {
        nodeModuleFolders = await getNodeModuleFolders();
    } catch (err) {
        console.info(`Failed to get node module folders.`);
        nodeModuleFolders = [];
    }

    loadExtensions(nodeModuleFolders)
        .then(finishStartup)
        .catch(err => {
            console.error(err);
            finishStartup();
        });
}

main();

// setTimeout(() => {
//     require("eez-studio-shared/module-stat");
// }, 1000);
