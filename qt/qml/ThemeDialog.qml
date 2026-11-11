import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    visible: opened
    anchors.fill: parent
    Rectangle { anchors.fill: parent; color: "#99000000"; MouseArea { anchors.fill: parent; onClicked: root.opened = false } }
    Rectangle {
        width: Math.min(448, parent.width - 24)
        height: Math.min(560, parent.height - 40)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 52
                Text { anchors.left: parent.left; anchors.leftMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "个性化主题与色彩"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: store.faintColor }
                MouseArea { anchors.right: parent.right; width: 40; height: parent.height; onClicked: root.opened = false }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: store.borderColor }
            }
            Flickable {
                width: parent.width
                height: parent.height - 108
                contentHeight: col.implicitHeight
                clip: true
                Column {
                    id: col
                    width: parent.width - 32
                    x: 16
                    y: 12
                    spacing: 14
                    Text { text: "外观模式"; color: store.faintColor; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Row {
                        spacing: 8
                        Repeater {
                            model: [
                                { id: "light", label: "浅色模式", icon: "☀" },
                                { id: "dark", label: "纯黑深色", icon: "☾" },
                                { id: "system", label: "跟随系统", icon: "💻" }
                            ]
                            delegate: Rectangle {
                                required property var modelData
                                width: 120
                                height: 64
                                radius: 12
                                color: store.themeMode === modelData.id ? store.primarySoft : "transparent"
                                border.color: store.themeMode === modelData.id ? store.primaryColor : store.borderColor
                                Column {
                                    anchors.centerIn: parent
                                    spacing: 4
                                    Text { text: modelData.icon; anchors.horizontalCenter: parent.horizontalCenter; font.pixelSize: 16 }
                                    Text { text: modelData.label; color: store.themeMode === modelData.id ? store.primaryColor : store.mutedColor; font.pixelSize: 12 }
                                }
                                MouseArea { anchors.fill: parent; onClicked: store.setThemeMode(modelData.id) }
                            }
                        }
                    }
                    Row {
                        width: parent.width
                        Text { text: "主题强调色"; color: store.faintColor; font.pixelSize: 11; font.weight: Font.DemiBold }
                        Item { width: parent.width - 160; height: 1 }
                        Rectangle { width: 12; height: 12; radius: 6; color: store.primaryColor; anchors.verticalCenter: parent.verticalCenter }
                        Text { text: store.primaryColor.toUpperCase(); color: store.mutedColor; font.pixelSize: 12; font.family: "Noto Sans Mono CJK SC" }
                    }
                    Grid {
                        columns: 4
                        spacing: 8
                        Repeater {
                            model: store.themePresets()
                            delegate: Rectangle {
                                required property var modelData
                                width: 92
                                height: 64
                                radius: 12
                                color: "transparent"
                                border.color: store.presetId === modelData.id ? (store.dark ? "white" : "#0f172a") : store.borderColor
                                Column {
                                    anchors.centerIn: parent
                                    spacing: 6
                                    Rectangle {
                                        width: 20; height: 20; radius: 10; color: modelData.color; anchors.horizontalCenter: parent.horizontalCenter
                                        Text { anchors.centerIn: parent; visible: store.presetId === modelData.id; text: "✓"; color: "white"; font.pixelSize: 11; font.bold: true }
                                    }
                                    Text { text: modelData.name; color: store.secondaryColor; font.pixelSize: 11 }
                                }
                                MouseArea { anchors.fill: parent; onClicked: store.setPreset(modelData.id) }
                            }
                        }
                    }
                    Rectangle {
                        width: parent.width
                        height: 48
                        radius: 12
                        color: store.inputColor
                        border.color: store.borderColor
                        Text { anchors.left: parent.left; anchors.leftMargin: 12; anchors.verticalCenter: parent.verticalCenter; text: "自定义任意颜色"; color: store.secondaryColor; font.pixelSize: 12 }
                        TextField {
                            id: hex
                            anchors.right: parent.right
                            anchors.rightMargin: 12
                            anchors.verticalCenter: parent.verticalCenter
                            width: 90
                            text: store.primaryColor
                            color: store.textColor
                            font.pixelSize: 12
                            font.family: "Noto Sans Mono CJK SC"
                            onEditingFinished: if (/^#[0-9a-fA-F]{6}$/.test(text)) store.setPrimaryColor(text)
                            background: Rectangle { radius: 8; color: store.surfaceColor; border.color: store.borderColor }
                        }
                    }
                }
            }
            Rectangle {
                width: parent.width - 28
                x: 14
                height: 40
                radius: 12
                color: store.primaryColor
                Text { anchors.centerIn: parent; text: "完成"; color: "white"; font.pixelSize: 13; font.weight: Font.Medium }
                MouseArea { anchors.fill: parent; onClicked: root.opened = false }
            }
        }
    }
}
