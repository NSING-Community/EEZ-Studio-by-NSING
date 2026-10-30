import React from "react";

import * as FlexLayout from "flexlayout-react";

import { t } from "eez-studio-shared/i18n";

// flexlayout-react 内置的提示文字是英文；它会在每次渲染时调用 i18nMapper，
// 所以这里接入 t() 后切换界面语言即可立即生效。
function i18nMapper(id: FlexLayout.I18nLabel, param?: string) {
    switch (id) {
        case FlexLayout.I18nLabel.Close_Tab:
            return t("Close");
        case FlexLayout.I18nLabel.Close_Tabset:
            return t("Close tabset");
        case FlexLayout.I18nLabel.Move_Tab:
            return t("Move:") + (param ?? "");
        case FlexLayout.I18nLabel.Move_Tabset:
            return t("Move tabset");
        case FlexLayout.I18nLabel.Maximize:
            return t("Maximize tabset");
        case FlexLayout.I18nLabel.Restore:
            return t("Restore tabset");
        case FlexLayout.I18nLabel.Float_Tab:
            return t("Show selected tab in floating window");
        case FlexLayout.I18nLabel.Overflow_Menu_Tooltip:
            return t("Hidden tabs");
        case FlexLayout.I18nLabel.Floating_Window_Message:
            return t("This panel is shown in a floating window");
        case FlexLayout.I18nLabel.Floating_Window_Show_Window:
            return t("Show window");
        case FlexLayout.I18nLabel.Floating_Window_Dock_Window:
            return t("Dock window");
        case FlexLayout.I18nLabel.Error_rendering_component:
            return t("Error rendering component");
        default:
            return id + (param === undefined ? "" : param);
    }
}

export class FlexLayoutContainer extends React.Component<{
    model: FlexLayout.Model;
    factory: (node: FlexLayout.TabNode) => React.ReactNode;
    onRenderTab?: (
        node: FlexLayout.TabNode,
        renderValues: FlexLayout.ITabRenderValues
    ) => void;
    iconFactory?: FlexLayout.IconFactory;
    onAuxMouseClick?: FlexLayout.NodeMouseEvent;
    onContextMenu?: FlexLayout.NodeMouseEvent;
    onModelChange?: (
        model: FlexLayout.Model,
        action: FlexLayout.Action
    ) => void;
    font?: FlexLayout.IFontValues;
}> {
    render() {
        return (
            <FlexLayout.Layout
                model={this.props.model}
                factory={this.props.factory}
                realtimeResize={true}
                onRenderTab={this.props.onRenderTab}
                iconFactory={this.props.iconFactory}
                onAuxMouseClick={this.props.onAuxMouseClick}
                onContextMenu={this.props.onContextMenu}
                onModelChange={this.props.onModelChange}
                font={this.props.font}
                i18nMapper={i18nMapper}
            />
        );
    }
}
