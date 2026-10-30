import React from "react";
import { action, observable, makeObservable, autorun } from "mobx";
import { observer } from "mobx-react";
import classNames from "classnames";

import { Icon } from "eez-studio-ui/icon";

import { t } from "eez-studio-shared/i18n";
import { studioVersion } from "eez-studio-shared/util";

import { Settings } from "home/settings";
import {
    NewProjectWizard,
    wizardModelTemplates,
    wizardModelExamples
} from "project-editor/project/ui/Wizard";
// 【定制】隐藏首页「扩展」「仪器」入口，以下 import 暂不启用（恢复时取消注释）。
// import {
//     ExtensionsManager,
//     extensionsManagerStore
// } from "./extensions-manager/extensions-manager";
import { Projects } from "home/open-projects";
// import { Instruments, defaultInstrumentsStore } from "home/instruments";
import { HOME_TAB_OPEN_ICON } from "project-editor/ui-components/icons";
import { instrumentDatabases } from "eez-studio-shared/db";

////////////////////////////////////////////////////////////////////////////////

const SAVED_OPTIONS_VERSION = 1;

// 首页侧边栏当前选中的页面。
export type HomeTabId =
    | "open"
    | "create"
    | "examples"
    | "run"
    | "instruments"
    | "extensions"
    | "settings";

// 首页（Home tab）状态：当前导航项、选项的读写。
class HomeTabStore {
    activeTab: HomeTabId = "open";

    constructor() {
        this.loadOptions();

        makeObservable(this, {
            activeTab: observable
        });

        autorun(() => this.saveOptions());
    }

    loadOptions() {
        const optionsJSON = window.localStorage.getItem("home-tab-options");
        if (optionsJSON) {
            try {
                const options = JSON.parse(optionsJSON);
                if (options.version == SAVED_OPTIONS_VERSION) {
                    this.activeTab = options.activeTab;
                }
            } catch (err) {
                console.error(err);
            }
        }
    }

    saveOptions() {
        window.localStorage.setItem(
            "home-tab-options",
            JSON.stringify({
                version: SAVED_OPTIONS_VERSION,

                activeTab: this.activeTab
            })
        );
    }
}

export const homeTabStore = new HomeTabStore();

////////////////////////////////////////////////////////////////////////////////

const HOME_TAB_CREATE_ICON = (
    <svg viewBox="0 0 24 24" fill="currentcolor">
        <path fill="none" d="M0 0h24v24H0z" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5v2H5v14h14v-5h2z" />
        <path d="M21 7h-4V3h-2v4h-4v2h4v4h2V9h4z" />
    </svg>
);

const HOME_TAB_EXAMPLES_ICON = (
    <svg viewBox="0 0 32 32" fill="currentcolor">
        <path d="M20 2v12l10-6-10-6z" />
        <path d="M28 14v8H4V6h10V4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8v4H8v2h16v-2h-4v-4h8a2 2 0 0 0 2-2v-8h-2ZM18 28h-4v-4h4v4Z" />
        <path d="M0 0h32v32H0z" fill="none" />
    </svg>
);

// 【定制】「仪器」导航图标，随「仪器」入口一并隐藏（恢复时取消注释）。
// const HOME_TAB_INSTRUMENTS_ICON = (
//     <svg viewBox="-50 -50 1124 1124" fill="currentcolor">
//         <path d="M128 896h896v128H0V0h128v896zm18.4-450.2 236.6-.2L443 205h81l74.4 318.6L662.6 314l81.4-.6L796.6 448l226.8-2.4.4 84H746.4l-41-104.2-60 289h-75l-89.6-333.2-32.6 148.4-301.8.2v-84z" />
//     </svg>
// );

////////////////////////////////////////////////////////////////////////////////

// 侧边栏单个导航项：圆角图标胶囊 + 文字标签。
const HomeNavigationItem = observer(
    (props: {
        id: HomeTabId;
        icon: JSX.Element | string;
        label: string;
        title: string;
        attention?: boolean;
    }) => (
        <div
            className={classNames("EezStudio_HomeTab_NavigationItem", {
                selected: homeTabStore.activeTab == props.id
            })}
            role="button"
            tabIndex={0}
            onClick={action(() => {
                homeTabStore.activeTab = props.id;
            })}
            onKeyDown={action((event: React.KeyboardEvent) => {
                if (event.key == "Enter" || event.key == " ") {
                    event.preventDefault();
                    homeTabStore.activeTab = props.id;
                }
            })}
            title={props.title}
        >
            {/* Icon renders a <div> wrapper when attention is set, so the chip
                has to be a <div> too - a <div> inside a <span> is invalid. */}
            <div className="EezStudio_HomeTab_NavigationItem_IconChip">
                <Icon
                    icon={props.icon}
                    size={20}
                    attention={props.attention}
                />
            </div>
            <div className="EezStudio_HomeTab_NavigationItem_Label">
                {props.label}
            </div>
        </div>
    )
);

////////////////////////////////////////////////////////////////////////////////

// 首页主体：左侧竖向侧边栏（打开项目/创建项目/示例项目/设置中心）与右侧内容区。【定制】已隐藏「仪器」「扩展」入口。
export const Home = observer(
    class Home extends React.Component {
        render() {
            return (
                <div className="EezStudio_HomeTab">
                    <div className="EezStudio_HomeTab_Sidebar">
                        <div className="EezStudio_HomeTab_Navigation">
                            <HomeNavigationItem
                                id="open"
                                icon={HOME_TAB_OPEN_ICON}
                                label={t("Open Project")}
                                title={t(
                                    "Open a local project or select one from the recent list"
                                )}
                            />
                            <HomeNavigationItem
                                id="create"
                                icon={HOME_TAB_CREATE_ICON}
                                label={t("Create Project")}
                                title={t("Create a new project")}
                            />
                            <HomeNavigationItem
                                id="examples"
                                icon={HOME_TAB_EXAMPLES_ICON}
                                label={t("Example Projects")}
                                title={t(
                                    "Example projects ready to run or edit"
                                )}
                            />
                            {/*【定制】隐藏「仪器」「扩展」导航入口（恢复时取消本注释）*/}
                            {/*<div
                                className={classNames(
                                    "EezStudio_HomeTab_NavigationItem",
                                    {
                                        selected:
                                            homeTabStore.activeTab ==
                                            "run"
                                    }
                                )}
                                onClick={action(() => {
                                    homeTabStore.activeTab = "run";
                                })}
                                title="Run dashboard projects from the list of shortcuts"
                            >
                                <Icon icon="material:apps" size={32} /> Run
                            </div>*/}
                            {/*<div
                                className={classNames(
                                    "EezStudio_HomeTab_NavigationItem",
                                    {
                                        selected:
                                            homeTabStore.activeTab ==
                                            "instruments"
                                    }
                                )}
                                onClick={action(() => {
                                    homeTabStore.activeTab = "instruments";
                                })}
                                title={t("Instruments manager")}
                            >
                                <Icon
                                    icon={HOME_TAB_INSTRUMENTS_ICON}
                                    size={32}
                                />{" "}
                                {t("Instruments")}
                            </div>
                            <div
                                className={classNames(
                                    "EezStudio_HomeTab_NavigationItem",
                                    {
                                        selected:
                                            homeTabStore.activeTab ==
                                            "extensions"
                                    }
                                )}
                                onClick={action(() => {
                                    homeTabStore.activeTab = "extensions";
                                })}
                                title={t("Extensions manager")}
                            >
                                <Icon
                                    icon={"material:extension"}
                                    size={32}
                                    attention={
                                        extensionsManagerStore
                                            .newVersionsInAllSections.length > 0
                                    }
                                />
                                {t("Extensions")}
                            </div>*/}

                            <div className="EezStudio_HomeTab_Sidebar_Divider" />

                            <HomeNavigationItem
                                id="settings"
                                icon="material:settings"
                                label={t("Settings Center")}
                                title={t("Global user settings")}
                                attention={
                                    instrumentDatabases.activeDatabase
                                        ?.isCompactDatabaseAdvisable
                                }
                            />
                        </div>

                        <div className="EezStudio_HomeTab_Sidebar_Footer">
                            {t("Version {version}", {
                                version: studioVersion
                            })}
                        </div>
                    </div>

                    <div className="EezStudio_HomeTab_Body">
                        {homeTabStore.activeTab == "open" && <Projects />}
                        {homeTabStore.activeTab == "create" && (
                            <NewProjectWizard
                                wizardModel={wizardModelTemplates}
                                modalDialog={observable.box<any>()}
                            />
                        )}
                        {homeTabStore.activeTab == "examples" && (
                            <NewProjectWizard
                                wizardModel={wizardModelExamples}
                                modalDialog={observable.box<any>()}
                            />
                        )}
                        {/*
                        homeTabStore.activeTab == "run" && (
                            <div style={{ margin: "auto" }}></div>
                        )
                        */}
                        {/*【定制】隐藏「仪器」「扩展」内容区（恢复时取消本注释）*/}
                        {/*{homeTabStore.activeTab == "instruments" && (
                            <Instruments
                                instrumentsStore={defaultInstrumentsStore}
                                size="M"
                            />
                        )}
                        {homeTabStore.activeTab == "extensions" && (
                            <ExtensionsManager />
                        )}*/}
                        {homeTabStore.activeTab == "settings" && <Settings />}
                    </div>
                </div>
            );
        }
    }
);
