import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    property string currentNoteId: ""
    property string query: ""
    signal chosen(string id, string title)
    visible: opened
    anchors.fill: parent
    z: 4

    Rectangle { anchors.fill: parent; color: "#99000000"; MouseArea { anchors.fill: parent; onClicked: root.opened = false } }
    Rectangle {
        width: Math.min(512, parent.width - 24)
        height: Math.min(560, parent.height - 48)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 48
                Text { anchors.left: parent.left; anchors.leftMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "插入便签引用"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: store.faintColor; font.pixelSize: 14 }
                MouseArea { anchors.right: parent.right; width: 40; height: parent.height; onClicked: root.opened = false }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: store.borderColor }
            }
            TextField {
                width: parent.width - 24
                x: 12
                placeholderText: "搜索要引用的便签标题或正文..."
                text: root.query
                onTextChanged: root.query = text
                color: store.textColor
                background: Rectangle { radius: 12; color: store.inputColor; border.color: store.borderColor }
            }
            ListView {
                width: parent.width
                height: parent.height - 100
                clip: true
                model: store.visibleNotes
                delegate: Rectangle {
                    required property var item
                    width: ListView.view.width
                    height: item.id === root.currentNoteId ? 0 : 56
                    visible: height > 0 && (root.query === "" || String(item.title).toLowerCase().indexOf(root.query.toLowerCase()) >= 0 || String(item.content).toLowerCase().indexOf(root.query.toLowerCase()) >= 0)
                    color: refHover.hovered ? store.chipColor : "transparent"
                    Column {
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.left: parent.left
                        anchors.leftMargin: 16
                        width: parent.width - 32
                        Text { text: item.title || "无标题便签"; color: store.textColor; font.pixelSize: 13; font.weight: Font.Medium; elide: Text.ElideRight; width: parent.width }
                        Text { text: item.snippet || ""; color: store.faintColor; font.pixelSize: 11; elide: Text.ElideRight; width: parent.width }
                    }
                    HoverHandler { id: refHover }
                    MouseArea { anchors.fill: parent; onClicked: { root.chosen(item.id, item.title); root.opened = false; root.query = "" } }
                }
            }
        }
    }
}
