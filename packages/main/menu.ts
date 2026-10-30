import os from "os";
import fs from "fs";
import {
    app,
    dialog,
    Menu,
    ipcMain,
    BrowserWindow,
    BaseWindow
} from "electron";
import { autorun, runInAction } from "mobx";

// 【定制】隐藏「导入仪器定义」菜单项，移除其引用的 import（恢复时取消注释并还原共享 import）。
// import { importInstrumentDefinitionFile } from "main/home-window";
import { openHomeWindow } from "main/home-window";
import {
    IWindow,
    setForceQuit,
    windows,
    findWindowByBrowserWindow,
    isCrashed
} from "main/window";
import { settings } from "main/settings";
import { APP_NAME } from "main/util";
import { undoManager } from "eez-studio-shared/store";
import { isDev } from "eez-studio-shared/util-electron";
import { currentLocale, t } from "eez-studio-shared/i18n";

////////////////////////////////////////////////////////////////////////////////

// 【定制】暂时隐藏关于页，菜单不再打开它。恢复时取消本注释。
// function showAboutBox(item: any, focusedWindow: any) {
//     if (focusedWindow) {
//         focusedWindow.webContents.send("show-about-box");
//     }
// }

function isMacOs() {
    return os.platform() === "darwin";
}

function enableMenuItem(
    menuItems: Electron.MenuItemConstructorOptions[],
    id: string,
    enabled: boolean
) {
    for (let i = 0; i < menuItems.length; i++) {
        if (menuItems[i].id === id) {
            menuItems[i].enabled = enabled;
            return;
        }
    }
}

async function openProjectWithFileDialog(focusedWindow: BaseWindow) {
    const result = await dialog.showOpenDialog(focusedWindow, {
        properties: ["openFile"],
        filters: [
            { name: t("EEZ Project"), extensions: ["eez-project"] },
            {
                name: t("EEZ Dashboard"),
                extensions: ["eez-dashboard"]
            },
            { name: t("All Files"), extensions: ["*"] }
        ]
    });
    const filePaths = result.filePaths;
    if (filePaths && filePaths[0]) {
        openFile(filePaths[0], focusedWindow, false);
    }
}

export function openFile(
    filePath: string,
    focusedWindow?: any,
    runMode?: boolean
) {
    if (
        filePath.toLowerCase().endsWith(".eez-project") ||
        filePath.toLowerCase().endsWith(".eez-dashboard")
    ) {
        if (!focusedWindow) {
            focusedWindow = BrowserWindow.getFocusedWindow() || undefined;
        }

        if (focusedWindow) {
            focusedWindow.webContents.send("open-project", filePath, runMode);
        }
    }
}

export function loadDebugInfo(debugInfoFilePath: string, focusedWindow?: any) {
    if (!focusedWindow) {
        focusedWindow = BrowserWindow.getFocusedWindow();
    }

    if (focusedWindow) {
        focusedWindow.webContents.send("load-debug-info", debugInfoFilePath);
    }
}

export function saveDebugInfo(focusedWindow?: any) {
    if (!focusedWindow) {
        focusedWindow = BrowserWindow.getFocusedWindow();
    }

    if (focusedWindow) {
        focusedWindow.webContents.send("save-debug-info");
    }
}

function createNewProject() {
    BrowserWindow.getFocusedWindow()!.webContents.send("new-project");
}

// 【定制】「添加仪器」菜单项的辅助函数，随菜单一并隐藏（恢复时取消注释并还原 Add Instrument 菜单项）。
// function addInstrument() {
//     BrowserWindow.getFocusedWindow()!.webContents.send("add-instrument");
// }

////////////////////////////////////////////////////////////////////////////////

function buildMacOSAppMenu(
    win: IWindow | undefined
): Electron.MenuItemConstructorOptions {
    return {
        label: APP_NAME,
        submenu: [
            // 【定制】暂时隐藏「关于」菜单项（关于页同时被禁用更新检查）。恢复时取消本注释。
            // {
            //     label: t("About {app}", { app: APP_NAME }),
            //     click: showAboutBox
            // },
            // {
            //     type: "separator"
            // },
            {
                label: t("Services"),
                role: "services",
                submenu: []
            },
            {
                type: "separator"
            },
            {
                label: t("Hide {app}", { app: APP_NAME }),
                accelerator: "Command+H",
                role: "hide"
            },
            {
                label: t("Hide Others"),
                accelerator: "Command+Alt+H",
                role: "hideOthers"
            },
            {
                label: t("Show All"),
                role: "unhide"
            },
            {
                type: "separator"
            },
            {
                label: t("Quit"),
                accelerator: "Command+Q",
                click: function () {
                    setForceQuit();
                    app.quit();
                }
            }
        ]
    };
}

////////////////////////////////////////////////////////////////////////////////

// 构建「文件」菜单。【定制】已隐藏 Add Instrument / Import Instrument Definition / Build Extensions。
function buildFileMenu(win: IWindow | undefined) {
    const fileMenuSubmenu: Electron.MenuItemConstructorOptions[] = [];

    fileMenuSubmenu.push(
        {
            label: t("New Project..."),
            accelerator: "CmdOrCtrl+N",
            click: function (item, focusedWindow) {
                createNewProject();
            }
        },
        //【定制】隐藏「文件」菜单项：Add Instrument...（恢复时取消本注释及 addInstrument 函数）
        // {
        //     label: t("Add Instrument..."),
        //     accelerator: "CmdOrCtrl+Alt+N",
        //     click: function (item, focusedWindow) {
        //         addInstrument();
        //     }
        // },
        {
            label: t("New Window"),
            accelerator: "CmdOrCtrl+Shift+N",
            click: function (item, focusedWindow) {
                openHomeWindow();
            }
        },
        {
            type: "separator"
        },
        {
            label: t("Open..."),
            accelerator: "CmdOrCtrl+O",
            click: (item, focusedWindow) => {
                if (!focusedWindow) {
                    focusedWindow =
                        BrowserWindow.getFocusedWindow() || undefined;
                }

                if (focusedWindow) {
                    openProjectWithFileDialog(focusedWindow);
                }
            }
        },
        {
            label: t("Open Recent"),
            submenu: settings.mru.map(mru => ({
                label: mru.filePath,
                click: function () {
                    if (fs.existsSync(mru.filePath)) {
                        openFile(mru.filePath);
                    } else {
                        // file not found, remove from mru
                        var i = settings.mru.indexOf(mru);
                        if (i != -1) {
                            runInAction(() => {
                                settings.mru.splice(i, 1);
                            });
                        }

                        // notify user
                        dialog.showMessageBox(
                            BrowserWindow.getFocusedWindow()!,
                            {
                                type: "error",
                                title: "EEZ Studio by Nsing",
                                message: t("File does not exist."),
                                detail: t("The file '{file}' does not seem to exist anymore.", {
                                    file: mru.filePath
                                })
                            }
                        );
                    }
                }
            }))
        }
    );

    if (
        win?.activeTabType === "project" ||
        win?.activeTabType === "run-project"
    ) {
        fileMenuSubmenu.push(
            {
                type: "separator"
            },
            {
                label: t("Reload Project"),
                click: function (item: any, focusedWindow: any) {
                    focusedWindow.webContents.send("reload-project");
                }
            }
        );

        fileMenuSubmenu.push(
            {
                type: "separator"
            },
            {
                label: t("Load Debug Info..."),
                click: async function (item: any, focusedWindow: any) {
                    const result = await dialog.showOpenDialog(focusedWindow, {
                        properties: ["openFile"],
                        filters: [
                            {
                                name: t("EEZ Debug Info"),
                                extensions: ["eez-debug-info"]
                            },
                            {
                                name: t("EEZ Debug Info"),
                                extensions: ["eez-debug-info"]
                            },
                            { name: t("All Files"), extensions: ["*"] }
                        ]
                    });
                    const filePaths = result.filePaths;
                    if (filePaths && filePaths[0]) {
                        loadDebugInfo(filePaths[0], focusedWindow);
                    }
                }
            }
        );

        if (win.state.isDebuggerActive) {
            fileMenuSubmenu.push({
                label: t("Save Debug Info..."),
                click: function (item: any, focusedWindow: any) {
                    saveDebugInfo(focusedWindow);
                }
            });
        }
    }

    //【定制】隐藏「文件」菜单项：Import Instrument Definition...（恢复时取消本注释并还原 import）
    // fileMenuSubmenu.push(
    //     {
    //         type: "separator"
    //     },
    //     {
    //         label: t("Import Instrument Definition..."),
    //         click: async function (item: any, focusedWindow: any) {
    //             const result = await dialog.showOpenDialog(focusedWindow, {
    //                 properties: ["openFile"],
    //                 filters: [
    //                     {
    //                         name: t("Instrument Definition Files"),
    //                         extensions: ["zip"]
    //                     },
    //                     { name: t("All Files"), extensions: ["*"] }
    //                 ]
    //             });
    //             const filePaths = result.filePaths;
    //             if (filePaths && filePaths[0]) {
    //                 importInstrumentDefinitionFile(filePaths[0]);
    //             }
    //         }
    //     }
    // );

    if (win?.activeTabType === "project") {
        fileMenuSubmenu.push(
            {
                type: "separator"
            },
            {
                id: "save",
                label: t("Save"),
                accelerator: "CmdOrCtrl+S",
                click: function (item: any, focusedWindow: any) {
                    if (focusedWindow) {
                        focusedWindow.webContents.send("save");
                    }
                }
            },
            {
                label: t("Save As"),
                accelerator: "CmdOrCtrl+Shift+S",
                click: function (item: any, focusedWindow: any) {
                    if (focusedWindow) {
                        focusedWindow.webContents.send("saveAs");
                    }
                }
            },

            {
                type: "separator"
            },
            {
                label: t("Check"),
                accelerator: "CmdOrCtrl+K",
                click: function (item: any, focusedWindow: any) {
                    if (focusedWindow) {
                        focusedWindow.webContents.send("check");
                    }
                }
            },
            {
                label: t("Build"),
                accelerator: "CmdOrCtrl+B",
                click: function (item: any, focusedWindow: any) {
                    if (focusedWindow) {
                        focusedWindow.webContents.send("build");
                    }
                }
            }
        );

        //【定制】隐藏「文件」菜单项：Build Extensions / Build and Install Extensions（恢复时取消本注释）
        // if (win.state.hasExtensionDefinitions) {
        //     fileMenuSubmenu.push(
        //         {
        //             label: t("Build Extensions"),
        //             click: function (item: any, focusedWindow: any) {
        //                 if (focusedWindow) {
        //                     focusedWindow.webContents.send("build-extensions");
        //                 }
        //             }
        //         },
        //         {
        //             label: t("Build and Install Extensions"),
        //             click: function (item: any, focusedWindow: any) {
        //                 if (focusedWindow) {
        //                     focusedWindow.webContents.send(
        //                         "build-and-install-extensions"
        //                     );
        //                 }
        //             }
        //         }
        //     );
        // }
    } else if (win?.activeTabType === "instrument") {
        fileMenuSubmenu.push(
            {
                type: "separator"
            },
            {
                id: "save",
                label: t("Save"),
                accelerator: "CmdOrCtrl+S",
                click: function (item: any, focusedWindow: any) {
                    if (focusedWindow) {
                        focusedWindow.webContents.send("save");
                    }
                }
            }
        );
    }

    let count = BrowserWindow.getAllWindows().filter(b => {
        return b.isVisible();
    }).length;
    if (count > 1) {
        fileMenuSubmenu.push(
            {
                type: "separator"
            },
            {
                label: t("Close Window"),
                accelerator: "CmdOrCtrl+W",
                click: function (item: any, focusedWindow: any) {
                    if (focusedWindow) {
                        if (isCrashed(focusedWindow)) {
                            app.exit();
                        } else {
                            focusedWindow.webContents.send("beforeClose");
                        }
                    }
                }
            }
        );
    }

    if (!isMacOs()) {
        fileMenuSubmenu.push(
            {
                type: "separator"
            },
            {
                label: t("Exit"),
                click: function (item: any, focusedWindow: any) {
                    if (isCrashed(focusedWindow)) {
                        app.exit();
                    } else {
                        setForceQuit();
                        app.quit();
                    }
                }
            }
        );
    }

    return {
        label: t("File"),
        submenu: fileMenuSubmenu
    };
}

////////////////////////////////////////////////////////////////////////////////

function buildEditMenu(win: IWindow | undefined) {
    const editSubmenu: Electron.MenuItemConstructorOptions[] = [
        {
            id: "undo",
            label: t("Undo"),
            accelerator: "CmdOrCtrl+Z",
            role: "undo",
            click: function (item, focusedWindow) {
                if (focusedWindow) {
                    const win = findWindowByBrowserWindow(focusedWindow);
                    if (win !== undefined && win.state.undo != null) {
                        win.browserWindow.webContents.send("undo");
                        return;
                    }
                }

                undoManager.undo();
            }
        },
        {
            id: "redo",
            label: t("Redo"),
            accelerator: "CmdOrCtrl+Y",
            role: "redo",
            click: function (item, focusedWindow) {
                if (focusedWindow) {
                    const win = findWindowByBrowserWindow(focusedWindow);
                    if (win !== undefined && win.state.redo != null) {
                        win.browserWindow.webContents.send("redo");
                        return;
                    }
                }

                undoManager.redo();
            }
        },
        {
            type: "separator"
        },
        {
            label: t("Cut"),
            accelerator: "CmdOrCtrl+X",
            role: "cut",
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("cut");
                }
            }
        },
        {
            label: t("Copy"),
            accelerator: "CmdOrCtrl+C",
            role: "copy",
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("copy");
                }
            }
        },
        {
            label: t("Paste"),
            accelerator: "CmdOrCtrl+V",
            role: "paste",
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("paste");
                }
            }
        },
        {
            label: t("Delete"),
            accelerator: "Delete",
            role: "delete",
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("delete");
                }
            }
        },
        {
            type: "separator"
        },
        {
            label: t("Select All"),
            accelerator: "CmdOrCtrl+A",
            role: "selectAll",
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("select-all");
                }
            }
        }
    ];

    if (win?.activeTabType === "project") {
        editSubmenu.push({
            type: "separator"
        });
        editSubmenu.push({
            label: t("Find Project Component"),
            accelerator: "CmdOrCtrl+Shift+F",
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("findProjectComponent");
                }
            }
        });
    }

    const editMenu: Electron.MenuItemConstructorOptions = {
        label: t("Edit"),
        submenu: editSubmenu
    };

    enableMenuItem(
        <Electron.MenuItemConstructorOptions[]>editMenu.submenu,
        "undo",
        win !== undefined && win.state.undo != null
            ? !!win.state.undo
            : undoManager.canUndo
    );

    enableMenuItem(
        <Electron.MenuItemConstructorOptions[]>editMenu.submenu,
        "redo",
        win !== undefined && win.state.redo != null
            ? !!win.state.redo
            : undoManager.canRedo
    );

    return editMenu;
}

////////////////////////////////////////////////////////////////////////////////

// 构建「视图」菜单。【定制】已隐藏 Extensions 与 Shortcuts and Groups。
function buildViewMenu(win: IWindow | undefined) {
    let viewSubmenu: Electron.MenuItemConstructorOptions[] = [];

    viewSubmenu.push(
        {
            label: t("Home"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("openTab", "home");
                }
            }
        },
        {
            label: t("History"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("openTab", "history");
                }
            }
        },
        //【定制】隐藏「视图」菜单项：Shortcuts and Groups（快捷键和分组）（恢复时取消本注释）
        // {
        //     label: t("Shortcuts and Groups"),
        //     click: function (item) {
        //         if (win) {
        //             win.browserWindow.webContents.send(
        //                 "openTab",
        //                 "shortcutsAndGroups"
        //             );
        //         }
        //     }
        // },
        {
            label: t("Noteboooks"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send(
                        "openTab",
                        "homeSection_notebooks"
                    );
                }
            }
        },
        //【定制】隐藏「视图」菜单项：Extensions（恢复时取消本注释）
        // {
        //     label: t("Extensions"),
        //     click: function (item) {
        //         if (win) {
        //             win.browserWindow.webContents.send("openTab", "extensions");
        //         }
        //     }
        // },
        {
            label: t("Settings"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("openTab", "settings");
                }
            }
        },
        {
            type: "separator"
        },
        {
            label: t("Scrapbook for Project Editor"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("showScrapbookManager");
                }
            }
        },
        {
            type: "separator"
        }
    );

    viewSubmenu.push(
        {
            label: t("Toggle Full Screen"),
            accelerator: (function () {
                if (isMacOs()) {
                    return "Ctrl+Command+F";
                } else {
                    return "F11";
                }
            })(),
            click: function (item, focusedWindow) {
                if (focusedWindow) {
                    focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                }
            }
        },
        {
            label: t("Toggle Developer Tools"),
            accelerator: (function () {
                if (isMacOs()) {
                    return "Alt+Command+I";
                } else {
                    return "Ctrl+Shift+I";
                }
            })(),
            click: function (item, focusedWindow: any) {
                if (focusedWindow) {
                    focusedWindow.toggleDevTools();
                }
            }
        },
        {
            label: settings.isDarkTheme
                ? t("Switch to Light Theme")
                : t("Switch to Dark Theme"),
            accelerator: (function () {
                if (isMacOs()) {
                    return "Alt+Command+T";
                } else {
                    return "Ctrl+Shift+T";
                }
            })(),
            click: function (item, focusedWindow: any) {
                if (focusedWindow) {
                    focusedWindow.webContents.send("switch-theme");
                }
            }
        },
        {
            type: "separator"
        },
        {
            label: t("Zoom In"),
            role: "zoomIn"
        },
        {
            label: t("Zoom Out"),
            role: "zoomOut"
        },
        {
            label: t("Reset Zoom"),
            role: "resetZoom"
        },
        {
            type: "separator"
        }
    );

    if (win?.activeTabType === "project") {
        viewSubmenu.push({
            type: "separator"
        });

        viewSubmenu.push({
            label: settings.showComponentsPaletteInProjectEditor
                ? t("Hide Components Palette")
                : t("Show Components Palette"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send(
                        "toggleComponentsPalette"
                    );
                }
            }
        });

        viewSubmenu.push({
            label: t("Reset Layout"),
            click: function (item) {
                if (win) {
                    win.browserWindow.webContents.send("resetLayoutModels");
                }
            }
        });

        viewSubmenu.push({
            type: "separator"
        });
    }

    viewSubmenu.push({
        label: t("Next Tab"),
        accelerator: "Ctrl+Tab",
        click: function (item) {
            if (win) {
                win.browserWindow.webContents.send("show-next-tab");
            }
        }
    });

    viewSubmenu.push({
        label: t("Previous Tab"),
        accelerator: "Ctrl+Shift+Tab",
        click: function (item) {
            if (win) {
                win.browserWindow.webContents.send("show-previous-tab");
            }
        }
    });

    viewSubmenu.push({
        type: "separator"
    });

    viewSubmenu.push({
        label: t("Reload"),
        accelerator: "CmdOrCtrl+R",
        click: function (item) {
            if (win) {
                win.browserWindow.webContents.send("reload");
                //focusedWindow.webContents.reload();
                //focusedWindow.webContents.clearHistory();
            }
        }
    });

    return {
        label: t("View"),
        submenu: viewSubmenu
    };
}

////////////////////////////////////////////////////////////////////////////////

function buildMacOSWindowMenu(
    win: IWindow | undefined
): Electron.MenuItemConstructorOptions {
    return {
        label: t("Window"),
        role: "window",
        submenu: [
            {
                label: t("Minimize"),
                accelerator: "CmdOrCtrl+M",
                role: "minimize"
            },
            {
                label: t("Close"),
                accelerator: "CmdOrCtrl+W",
                role: "close"
            },
            {
                type: "separator"
            },
            {
                label: t("Bring All to Front"),
                role: "front"
            }
        ]
    };
}

////////////////////////////////////////////////////////////////////////////////

function buildHelpMenu(
    win: IWindow | undefined
): Electron.MenuItemConstructorOptions | undefined {
    const helpMenuSubmenu: Electron.MenuItemConstructorOptions[] = [];

    if (isDev) {
        helpMenuSubmenu.push({
            label: t("Documentation"),
            accelerator: "F1",
            click: function (item: any, focusedWindow: any) {
                focusedWindow.webContents.send("show-documentation-browser");
            }
        });
        helpMenuSubmenu.push({
            type: "separator"
        });
    }

    // 【定制】暂时隐藏「关于」菜单项（关于页同时被禁用更新检查）。恢复时取消本注释。
    // helpMenuSubmenu.push({
    //     label: t("About"),
    //     click: showAboutBox
    // });

    // 【定制】隐藏「关于」后可能留下尾部分隔线；菜单为空时整个「帮助」菜单不再挂载。
    while (
        helpMenuSubmenu.length > 0 &&
        helpMenuSubmenu[helpMenuSubmenu.length - 1].type === "separator"
    ) {
        helpMenuSubmenu.pop();
    }

    if (helpMenuSubmenu.length === 0) {
        return undefined;
    }

    return {
        label: t("Help"),
        role: "help",
        submenu: helpMenuSubmenu
    };
}

////////////////////////////////////////////////////////////////////////////////

// 组装完整应用菜单模板（文件/编辑/视图/窗口/帮助，按平台分支）。
function buildMenuTemplate(win: IWindow | undefined) {
    var menuTemplate: Electron.MenuItemConstructorOptions[] = [];

    if (isMacOs()) {
        menuTemplate.push(buildMacOSAppMenu(win));
    }

    menuTemplate.push(buildFileMenu(win));

    menuTemplate.push(buildEditMenu(win));

    menuTemplate.push(buildViewMenu(win));

    if (isMacOs()) {
        menuTemplate.push(buildMacOSWindowMenu(win));
    } else {
        // 【定制】「帮助」菜单里只剩「关于」（生产构建下），隐藏后不再挂一个空菜单。
        const helpMenu = buildHelpMenu(win);
        if (helpMenu) {
            menuTemplate.push(helpMenu);
        }
    }

    return menuTemplate;
}

////////////////////////////////////////////////////////////////////////////////

autorun(() => {
    // 依赖 currentLocale：locale 变化时重建菜单
    currentLocale.get();

    for (let i = 0; i < windows.length; i++) {
        const win = windows[i];
        if (win.focused) {
            let menuTemplate = buildMenuTemplate(win);
            let menu = Menu.buildFromTemplate(menuTemplate);
            Menu.setApplicationMenu(menu);
        }
    }

    // 重建后让各窗口页面内的自绘菜单栏重新取标签（见下面「自绘菜单栏」一节）。
    for (let i = 0; i < windows.length; i++) {
        const webContents = windows[i].browserWindow.webContents;
        if (!webContents.isDestroyed()) {
            webContents.send("menu-bar-changed");
        }
    }
});

////////////////////////////////////////////////////////////////////////////////
// 自绘菜单栏支持
//
// Windows/Linux 上 titleBarStyle:"hidden"（main/window.ts，为了自绘橙色标题栏）会连带
// 去掉原生菜单栏 —— 菜单栏本来就是原生边框的一部分，而且 Electron 不允许单独把它加回来
// （实测：isMenuBarVisible() 恒为 false，setMenuBarVisibility(true) 也无效）。所以菜单栏
// 改由页面自己画（home/menu-bar.tsx）：页面只负责画顶层标签和位置，点开时从这里弹出真正
// 的原生菜单，菜单内容、勾选状态、禁用状态仍然只有本文件这一处来源。
//
// 快捷键不需要在这里转发：原生菜单栏虽然不显示，加速键表仍然挂在窗口上（实测
// Ctrl+Shift+F 依旧能打开「查找项目组件」）。反过来，如果这里再转发一遍，一次按键会触发两次。

ipcMain.on("get-menu-bar-items", function (event: any) {
    const menu = Menu.getApplicationMenu();

    event.returnValue = menu ? menu.items.map(item => ({ label: item.label })) : [];
});

ipcMain.on("popup-menu-bar-item", function (
    event: any,
    index: number,
    x: number,
    y: number
) {
    const menu = Menu.getApplicationMenu();
    const item = menu && menu.items[index];

    if (!item || !item.submenu) {
        return;
    }

    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (!browserWindow) {
        return;
    }

    // 页面给的是 CSS 像素，popup 要的是 DIP —— 用户用「视图 → 放大」缩放后两者不相等。
    const zoomFactor = event.sender.getZoomFactor();

    item.submenu.popup({
        window: browserWindow,
        x: Math.round(x * zoomFactor),
        y: Math.round(y * zoomFactor),
        callback: () => {
            // 原生菜单关闭后清掉页面上的高亮态。
            if (!event.sender.isDestroyed()) {
                event.sender.send("menu-bar-item-closed", index);
            }
        }
    });
});

////////////////////////////////////////////////////////////////////////////////

ipcMain.on("getReservedKeybindings", function (event: any) {
    const menuTemplate = buildMenuTemplate(undefined);

    let keybindings: string[] = [];

    function addKeybinding(accelerator: Electron.Accelerator) {
        let keybinding = accelerator.toString();

        if (isMacOs()) {
            keybinding = keybinding.replace("CmdOrCtrl", "Meta");
            keybinding = keybinding.replace("CommandOrControl", "Meta");
        } else {
            keybinding = keybinding.replace("CmdOrCtrl", "Ctrl");
            keybinding = keybinding.replace("CommandOrControl", "Ctrl");
        }

        keybindings.push(keybinding);
    }

    function addKeybindings(menu: Electron.MenuItemConstructorOptions[]) {
        for (let i = 0; i < menu.length; i++) {
            const menuItem = menu[i];
            if (menuItem.accelerator) {
                addKeybinding(menuItem.accelerator);
            }
            if (menuItem.submenu && "length" in menuItem.submenu) {
                addKeybindings(
                    menuItem.submenu as Electron.MenuItemConstructorOptions[]
                );
            }
        }
    }

    addKeybindings(menuTemplate);

    event.returnValue = keybindings;
});

ipcMain.on("open-file", function (event, path, runMode) {
    openFile(path, undefined, runMode);
});

ipcMain.on("new-project", function (event) {
    createNewProject();
});

ipcMain.on("open-project", function (event) {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
        openProjectWithFileDialog(focusedWindow);
    }
});
