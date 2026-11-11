import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    property var note: null
    property string previewImage: ""
    signal editRequested(var note)
    signal duplicateRequested(var note)
    signal deleteRequested(string id)
    signal pinRequested(var note)
    signal historyRequested(var note)
    signal exportRequested(var note)
    signal navigateRequested(string id)
    visible: opened && note
    anchors.fill: parent

    Rectangle { anchors.fill: parent; color: "#99000000"; MouseArea { anchors.fill: parent; onClicked: root.opened = false } }
    Rectangle {
        width: Math.min(672, parent.width - 16)
        height: Math.min(parent.height * 0.92, parent.height - 16)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width
                height: 52
                color: store.dark ? "#27272a" : "#f8fafc"
                Row {
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 6
                    Rectangle {
                        visible: root.note
                        height: 26
                        radius: 8
                        width: Math.min(220, projText.implicitWidth + 28)
                        color: Qt.rgba(0.06, 0.7, 0.5, 0.12)
                        anchors.verticalCenter: parent.verticalCenter
                        Row {
                            anchors.centerIn: parent
                            spacing: 6
                            Rectangle { width: 8; height: 8; radius: 4; color: root.projectColor(); anchors.verticalCenter: parent.verticalCenter }
                            Text { id: projText; text: root.projectName(); color: root.projectColor(); font.pixelSize: 12; font.weight: Font.Medium }
                        }
                    }
                    Item { width: 1; height: 1 }
                    Repeater {
                        model: [
                            { t: root.note && root.note.pinned ? "📌" : "📌", a: "pin" },
                            { t: "⏱", a: "hist" },
                            { t: "↗", a: "export" },
                            { t: "⧉", a: "copy" },
                            { t: "编辑", a: "edit" },
                            { t: "🗑", a: "del" },
                            { t: "✕", a: "close" }
                        ]
                        delegate: Rectangle {
                            required property var modelData
                            width: modelData.a === "edit" ? 64 : 32
                            height: 32
                            radius: 8
                            anchors.verticalCenter: parent.verticalCenter
                            color: modelData.a === "edit" ? store.primarySoft : "transparent"
                            border.color: modelData.a === "edit" ? store.primaryColor : "transparent"
                            Text { anchors.centerIn: parent; text: modelData.t; color: modelData.a === "edit" ? store.primaryColor : store.mutedColor; font.pixelSize: 12 }
                            MouseArea {
                                anchors.fill: parent
                                onClicked: {
                                    if (modelData.a === "pin") root.pinRequested(root.note)
                                    else if (modelData.a === "hist") root.historyRequested(root.note)
                                    else if (modelData.a === "export") root.exportRequested(root.note)
                                    else if (modelData.a === "copy") root.duplicateRequested(root.note)
                                    else if (modelData.a === "edit") root.editRequested(root.note)
                                    else if (modelData.a === "del") root.deleteRequested(root.note.id)
                                    else root.opened = false
                                }
                            }
                        }
                    }
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: store.borderColor }
            }
            Flickable {
                width: parent.width
                height: parent.height - 52
                contentHeight: body.implicitHeight + 24
                clip: true
                Column {
                    id: body
                    width: parent.width - 40
                    x: 20
                    y: 16
                    spacing: 12
                    Text { width: parent.width; text: root.note ? root.note.title : ""; color: store.textColor; font.pixelSize: 22; font.weight: Font.Bold; wrapMode: Text.WordWrap }
                    Text {
                        width: parent.width
                        textFormat: Text.RichText
                        text: root.note ? store.markdownHtml(root.note.content) : ""
                        wrapMode: Text.WordWrap
                        color: store.secondaryColor
                        onLinkActivated: (link) => { if (String(link).indexOf("note:") === 0) root.navigateRequested(String(link).substring(5)) }
                    }
                    Grid {
                        visible: root.note && root.note.imagePaths && root.note.imagePaths.length > 0
                        columns: 3
                        spacing: 8
                        Repeater {
                            model: root.note && root.note.imagePaths ? root.note.imagePaths : []
                            delegate: Image {
                                required property string modelData
                                width: 180
                                height: 110
                                fillMode: Image.PreserveAspectCrop
                                source: modelData
                                MouseArea { anchors.fill: parent; onClicked: root.previewImage = modelData }
                            }
                        }
                    }
                    Column {
                        id: backs
                        width: parent.width
                        spacing: 8
                        property var links: root.note ? store.backlinks(root.note.id) : []
                        visible: links.length > 0
                        Text { text: "反向链接 · 被以下 " + backs.links.length + " 条便签引用"; color: store.faintColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        Repeater {
                            model: backs.links
                            delegate: Rectangle {
                                required property var modelData
                                width: backs.width
                                height: 52
                                radius: 12
                                border.color: store.borderColor
                                color: store.surfaceColor
                                Column {
                                    anchors.centerIn: parent
                                    width: parent.width - 20
                                    Text { text: modelData.title; color: store.textColor; font.pixelSize: 12; font.weight: Font.Medium; elide: Text.ElideRight; width: parent.width }
                                    Text { text: modelData.snippet || ""; color: store.faintColor; font.pixelSize: 11; elide: Text.ElideRight; width: parent.width }
                                }
                                MouseArea { anchors.fill: parent; onClicked: root.navigateRequested(modelData.id) }
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
    function projectColor() {
        if (!note) return store.primaryColor
        const p = store.projectById(note.projectId)
        return p && p.color ? p.color : store.primaryColor
    }
    Rectangle {
        visible: previewImage !== ""
        anchors.fill: parent
        color: "#e6000000"
        z: 6
        Image { anchors.centerIn: parent; width: parent.width * 0.8; height: parent.height * 0.8; fillMode: Image.PreserveAspectFit; source: root.previewImage }
        MouseArea { anchors.fill: parent; onClicked: root.previewImage = "" }
    }
}
