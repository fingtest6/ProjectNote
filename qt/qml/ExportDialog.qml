import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    property var note: null
    property string status: ""
    property bool copied: false
    property string cardPath: ""
    property bool showRaw: false
    visible: opened && note
    anchors.fill: parent
    Rectangle { anchors.fill: parent; color: "#99000000"; MouseArea { anchors.fill: parent; onClicked: root.opened = false } }
    Rectangle {
        width: Math.min(512, parent.width - 16)
        height: Math.min(parent.height * 0.9, 680)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 48
                Text { anchors.left: parent.left; anchors.leftMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "便签导出与本地保存"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: store.faintColor }
                MouseArea { anchors.right: parent.right; width: 40; height: parent.height; onClicked: root.opened = false }
            }
            Rectangle {
                visible: root.status !== ""
                width: parent.width
                height: visible ? 36 : 0
                color: store.primarySoft
                Text { anchors.left: parent.left; anchors.leftMargin: 12; anchors.verticalCenter: parent.verticalCenter; text: root.status; color: store.primaryColor; font.pixelSize: 12; width: parent.width - 24; elide: Text.ElideRight }
            }
            Row {
                width: parent.width
                height: 48
                spacing: 8
                leftPadding: 12
                Rectangle {
                    width: 140; height: 32; radius: 12; color: store.primaryColor; anchors.verticalCenter: parent.verticalCenter
                    Text { anchors.centerIn: parent; text: "保存 .md 文件"; color: "white"; font.pixelSize: 12 }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            root.status = "正在调起文件保存接口..."
                            const ok = store.saveTextFile((root.note.title || "便签") + ".md", root.note.content)
                            root.status = ok ? "Markdown 文件已保存！" : "已取消文件保存"
                        }
                    }
                }
                Rectangle {
                    width: 140; height: 32; radius: 12; color: store.chipColor; anchors.verticalCenter: parent.verticalCenter
                    Text { anchors.centerIn: parent; text: "保存卡片图片"; color: store.secondaryColor; font.pixelSize: 12 }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            root.status = "正在生成卡片图片..."
                            const path = store.renderCard(root.note.id)
                            root.cardPath = path
                            const ok = path && store.saveImageFile((root.note.title || "便签卡片") + ".png", path)
                            root.status = ok ? "卡片图片已保存！" : "已生成预览，保存已取消"
                        }
                    }
                }
                Rectangle {
                    width: 96; height: 32; radius: 12; border.color: store.borderColor; anchors.verticalCenter: parent.verticalCenter
                    Text { anchors.centerIn: parent; text: root.copied ? "已复制" : "复制文本"; color: store.secondaryColor; font.pixelSize: 12 }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            store.copyText(root.note.content)
                            root.copied = true
                            root.status = "便签 Markdown 内容已复制到剪贴板！"
                        }
                    }
                }
            }
            Flickable {
                width: parent.width
                height: parent.height - 144
                contentHeight: box.implicitHeight
                clip: true
                Column {
                    id: box
                    width: parent.width - 32
                    x: 16
                    spacing: 12
                    Image {
                        visible: root.cardPath !== ""
                        width: parent.width
                        fillMode: Image.PreserveAspectFit
                        source: root.cardPath ? ("file://" + root.cardPath) : ""
                    }
                    Rectangle {
                        visible: root.cardPath === ""
                        width: parent.width
                        radius: 16
                        color: store.surfaceColor
                        border.color: store.borderColor
                        implicitHeight: previewCol.implicitHeight + 24
                        Column {
                            id: previewCol
                            width: parent.width - 28
                            x: 14
                            y: 12
                            spacing: 6
                            Text { text: root.projectName(); color: store.mutedColor; font.pixelSize: 12 }
                            Text { text: root.note ? root.note.title : ""; color: store.textColor; font.pixelSize: 16; font.weight: Font.Bold; wrapMode: Text.WordWrap; width: parent.width }
                            Text { text: root.note ? ("更新时间：" + store.formatTime(root.note.updatedAt, true)) : ""; color: store.faintColor; font.pixelSize: 11; font.family: "Noto Sans Mono CJK SC" }
                            Text { text: root.note ? root.note.content : ""; color: store.secondaryColor; font.pixelSize: 12; wrapMode: Text.WordWrap; width: parent.width; maximumLineCount: 6; elide: Text.ElideRight }
                        }
                    }
                    Rectangle {
                        width: parent.width
                        radius: 12
                        border.color: store.borderColor
                        implicitHeight: rawCol.implicitHeight + 16
                        Column {
                            id: rawCol
                            width: parent.width - 20
                            x: 10
                            y: 8
                            Text { text: root.showRaw ? "查看 / 复制原始 Markdown 全文    收起" : "查看 / 复制原始 Markdown 全文    展开文本框"; color: store.secondaryColor; font.pixelSize: 12 }
                            MouseArea { width: parent.width; height: 20; onClicked: root.showRaw = !root.showRaw }
                            TextArea {
                                visible: root.showRaw
                                width: parent.width
                                height: 120
                                readOnly: true
                                text: root.note ? root.note.content : ""
                                wrapMode: TextArea.Wrap
                                font.pixelSize: 12
                                font.family: "Noto Sans Mono CJK SC"
                                color: store.secondaryColor
                                selectByMouse: true
                            }
                        }
                    }
                }
            }
        }
    }
    function projectName() {
        if (!note) return ""
        const p = store.projectById(note.projectId)
        return p && p.name ? p.name : ""
    }
}
