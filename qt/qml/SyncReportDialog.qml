import QtQuick
import QtQuick.Controls

Item {
    id: root
    visible: store.hasSyncReport
    anchors.fill: parent
    z: 60
    property bool showDetails: true
    Rectangle { anchors.fill: parent; color: "#a6000000"; MouseArea { anchors.fill: parent; onClicked: store.dismissReport() } }
    Rectangle {
        width: Math.min(512, parent.width - 32)
        height: Math.min(560, parent.height - 40)
        anchors.centerIn: parent
        radius: 24
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 64
                Text { x: 16; anchors.verticalCenter: parent.verticalCenter; text: store.syncReport.success ? "互联同步完成报告" : "同步未能完成"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: store.faintColor }
                MouseArea { anchors.right: parent.right; width: 40; height: parent.height; onClicked: store.dismissReport() }
            }
            Flickable {
                width: parent.width
                height: parent.height - 120
                contentHeight: body.implicitHeight
                clip: true
                Column {
                    id: body
                    width: parent.width - 32
                    x: 16
                    spacing: 10
                    Text { width: parent.width; wrapMode: Text.WordWrap; text: store.syncReport.message || ""; color: store.syncReport.success ? "#047857" : "#be123c"; font.pixelSize: 12 }
                    Grid {
                        visible: !!store.syncReport.success
                        columns: 4
                        spacing: 8
                        Repeater {
                            model: [
                                { k: "拉取变更", v: store.syncReport.pulledNotes || 0, u: "篇", c: "#2563eb" },
                                { k: "推送变更", v: store.syncReport.pushedNotes || 0, u: "篇", c: "#d97706" },
                                { k: "新增便签", v: store.syncReport.newNotesAdded || 0, u: "篇", c: "#059669" },
                                { k: "历史版本", v: store.syncReport.historiesSynced || 0, u: "条", c: "#7c3aed" }
                            ]
                            delegate: Rectangle {
                                required property var modelData
                                width: 100
                                height: 64
                                radius: 16
                                color: store.inputColor
                                border.color: store.borderColor
                                Column {
                                    anchors.centerIn: parent
                                    Text { text: modelData.k; color: store.faintColor; font.pixelSize: 10; anchors.horizontalCenter: parent.horizontalCenter }
                                    Text { text: modelData.v + " " + modelData.u; color: modelData.c; font.pixelSize: 18; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
                                }
                            }
                        }
                    }
                    Text { text: root.showDetails ? "详细变动清单  收起" : "详细变动清单  展开"; color: store.secondaryColor; font.pixelSize: 12 }
                    MouseArea { width: parent.width; height: 18; onClicked: root.showDetails = !root.showDetails }
                    Repeater {
                        model: root.showDetails ? (store.syncReport.details || []) : []
                        delegate: Text {
                            required property string modelData
                            width: body.width
                            wrapMode: Text.WordWrap
                            text: modelData
                            color: store.secondaryColor
                            font.pixelSize: 11
                        }
                    }
                    Text {
                        visible: store.syncReport.success === true && (!store.syncReport.details || store.syncReport.details.length === 0)
                        text: "双方便签与分类已是最新状态，无新增或冲突变动。"
                        color: store.faintColor
                        font.pixelSize: 12
                    }
                }
            }
            Row {
                width: parent.width - 24
                x: 12
                height: 48
                spacing: 8
                layoutDirection: Qt.RightToLeft
                Rectangle {
                    width: 110; height: 34; radius: 12; color: store.primaryColor
                    Text { anchors.centerIn: parent; text: "完成并关闭"; color: "white"; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; onClicked: store.dismissReport() }
                }
                Rectangle {
                    visible: store.hasUndo && store.syncReport.success
                    width: 120; height: 34; radius: 12; border.color: store.borderColor
                    Text { anchors.centerIn: parent; text: "撤销本次同步"; color: store.secondaryColor; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; onClicked: root.askUndo() }
                }
            }
        }
    }
    signal undoAsked()
    function askUndo() { undoAsked() }
}
