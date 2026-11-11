import QtQuick
import QtQuick.Controls

Rectangle {
    id: card
    property var note
    property var project: null
    signal openRequested()
    signal editRequested()
    signal duplicateRequested()
    signal deleteRequested()
    signal pinRequested()
    signal historyRequested()
    signal exportRequested()

    radius: 16
    color: note && note.pinned ? (store.dark ? "#1c1410" : "#fffdf5") : store.surfaceColor
    border.width: 1
    border.color: note && note.pinned ? (store.dark ? "#b45309" : "#fcd34d") : (hover.hovered ? (store.dark ? "#3f3f46" : "#cbd5e1") : (store.dark ? "#27272a" : "#e2e8f0"))
    implicitHeight: body.implicitHeight + 28

    HoverHandler { id: hover }

    Column {
        id: body
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 16
        spacing: 8

        Row {
            width: parent.width
            spacing: 8
            Rectangle {
                visible: project
                height: 20
                radius: 6
                color: store.chipColor
                width: Math.min(160, chipRow.implicitWidth + 12)
                Row {
                    id: chipRow
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: 6
                    spacing: 6
                    Rectangle { width: 6; height: 6; radius: 3; color: project ? project.color : store.primaryColor; anchors.verticalCenter: parent.verticalCenter }
                    Text {
                        text: project ? project.name : ""
                        color: store.secondaryColor
                        font.pixelSize: 11
                        font.weight: Font.Medium
                        elide: Text.ElideRight
                        width: Math.min(120, implicitWidth)
                    }
                }
            }
            Item { width: 1; height: 1; visible: !project }
            Item { width: parent.width - (project ? 168 : 0) - pinBadge.width - 8; height: 1 }
            Rectangle {
                id: pinBadge
                visible: note && note.pinned
                height: 20
                radius: 6
                color: store.dark ? "#451a03" : "#fffbeb"
                border.color: store.dark ? "#92400e" : "#fde68a"
                width: pinRow.implicitWidth + 12
                Row {
                    id: pinRow
                    anchors.centerIn: parent
                    spacing: 4
                    Text { text: "📌"; font.pixelSize: 10 }
                    Text { text: "置顶"; color: store.dark ? "#fbbf24" : "#d97706"; font.pixelSize: 11; font.weight: Font.DemiBold }
                }
            }
        }

        Text {
            width: parent.width
            text: note ? (note.title || "无标题便签") : ""
            color: hover.hovered ? store.primaryColor : store.textColor
            font.pixelSize: 15
            font.weight: Font.DemiBold
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
        }

        Text {
            width: parent.width
            visible: note && note.snippet
            text: note ? note.snippet : ""
            color: store.mutedColor
            font.pixelSize: 13
            wrapMode: Text.WordWrap
            maximumLineCount: 3
            elide: Text.ElideRight
            lineHeight: 1.35
        }

        Image {
            visible: note && note.imagePaths && note.imagePaths.length > 0
            width: parent.width
            height: visible ? 128 : 0
            source: visible ? note.imagePaths[0] : ""
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            Rectangle {
                anchors.fill: parent
                radius: 12
                color: "transparent"
                border.color: store.borderColor
                clip: false
            }
        }

        Row {
            spacing: 6
            visible: note && ((note.referenceCount || 0) > 0 || (note.images && note.images.length > 0))
            Rectangle {
                visible: note && note.referenceCount > 0
                height: 20
                radius: 6
                color: store.primarySoft
                border.color: store.primaryColor
                border.width: 1
                width: refText.implicitWidth + 16
                Text { id: refText; anchors.centerIn: parent; text: "引用 " + (note ? note.referenceCount : 0) + " 处"; color: store.primaryColor; font.pixelSize: 11; font.weight: Font.Medium }
            }
            Rectangle {
                visible: note && note.images && note.images.length > 0
                height: 20
                radius: 6
                color: store.chipColor
                border.color: store.borderColor
                width: imgText.implicitWidth + 16
                Text { id: imgText; anchors.centerIn: parent; text: note.images.length + " 张图片"; color: store.mutedColor; font.pixelSize: 11 }
            }
        }

        Rectangle { width: parent.width; height: 1; color: store.dark ? "#27272a" : "#f1f5f9" }

        Item {
            width: parent.width
            height: 28
            Text {
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: note ? store.formatTime(note.updatedAt, false) : ""
                color: store.faintColor
                font.pixelSize: 11
                font.family: "Noto Sans Mono CJK SC"
            }
            Row {
                id: actions
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2
                Repeater {
                    model: [
                        { tip: note && note.pinned ? "取消置顶" : "置顶", label: note && note.pinned ? "★" : "☆", action: "pin", on: note && note.pinned },
                        { tip: "查看修改历史与 Git 差异", label: "⏱", action: "history" },
                        { tip: "导出便签", label: "↗", action: "export" },
                        { tip: "复制便签（含 Git 历史）", label: "⧉", action: "copy" },
                        { tip: "编辑便签", label: "✎", action: "edit" },
                        { tip: "删除便签", label: "🗑", action: "delete" }
                    ]
                    delegate: Rectangle {
                        required property var modelData
                        width: 28
                        height: 28
                        radius: 8
                        color: iconHover.hovered ? (modelData.action === "delete" ? (store.dark ? "#4c0519" : "#fff1f2") : store.chipColor) : (modelData.on ? (store.dark ? "#451a03" : "#fffbeb") : "transparent")
                        Text {
                            anchors.centerIn: parent
                            text: modelData.label
                            font.pixelSize: 12
                            color: modelData.action === "delete" && iconHover.hovered ? "#f43f5e" : (modelData.on ? "#d97706" : store.faintColor)
                        }
                        HoverHandler { id: iconHover }
                        ToolTip.visible: iconHover.hovered
                        ToolTip.text: modelData.tip
                        ToolTip.delay: 400
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (modelData.action === "pin") card.pinRequested()
                                else if (modelData.action === "history") card.historyRequested()
                                else if (modelData.action === "export") card.exportRequested()
                                else if (modelData.action === "copy") card.duplicateRequested()
                                else if (modelData.action === "edit") card.editRequested()
                                else if (modelData.action === "delete") card.deleteRequested()
                            }
                        }
                    }
                }
            }
        }
    }

    MouseArea {
        anchors.fill: parent
        z: -1
        cursorShape: Qt.PointingHandCursor
        onClicked: card.openRequested()
    }
}
