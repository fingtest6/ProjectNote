import QtQuick
import QtQuick.Controls

Item {
    id: root
    visible: store.hasIncoming
    anchors.fill: parent
    z: 70
    property int countdown: 40
    property bool submitting: false
    onVisibleChanged: if (visible) { countdown = 40; submitting = false; timer.start() } else timer.stop()
    Timer {
        id: timer
        interval: 1000
        repeat: true
        onTriggered: {
            if (root.submitting) { stop(); return }
            root.countdown -= 1
            if (root.countdown <= 0) {
                stop()
                store.rejectSync()
            }
        }
    }
    function modeLabel() {
        const mode = store.incomingSync.mode || "smart-merge"
        if (mode === "push-overwrite") return "以对方版本完全覆盖本机"
        if (mode === "pull-overwrite") return "以本机版本完全覆盖对方"
        if (mode === "new-only") return "仅同步新增便签"
        return "双向智能合并"
    }
    function modeDesc() {
        const mode = store.incomingSync.mode || "smart-merge"
        if (mode === "push-overwrite") return "对方数据作为唯一基准，本机所有便签和分类将被对方完全覆盖重置！"
        if (mode === "pull-overwrite") return "对方请求拉取本机全部数据，本机数据保持不变，将完整克隆提供给对方。"
        if (mode === "new-only") return "仅同步双方各自新创建的便签，双方已有的便签内容绝不改动。"
        return "双方各自新增互相保留；相同便签按最新时间自动合并，无缝融合历史版本。"
    }
    Rectangle { anchors.fill: parent; color: "#bf000000" }
    Rectangle {
        width: Math.min(448, parent.width - 32)
        implicitHeight: col.implicitHeight
        anchors.centerIn: parent
        radius: 24
        color: store.surfaceColor
        border.color: store.borderColor
        Column {
            id: col
            width: parent.width
            spacing: 0
            Rectangle {
                width: parent.width
                height: 84
                color: store.dark ? "#3a2a12" : "#fffbeb"
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: 16
                    spacing: 4
                    Text { text: "收到局域网互联同步请求"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                    Text { text: "请确认是否允许此设备与本机进行数据交换 (" + root.countdown + "s)"; color: "#d97706"; font.pixelSize: 12 }
                }
            }
            Column {
                width: parent.width - 32
                x: 16
                spacing: 12
                topPadding: 16
                bottomPadding: 8
                Text { text: "请求发起设备"; color: store.faintColor; font.pixelSize: 11; font.weight: Font.DemiBold }
                Text { text: store.incomingSync.deviceName || ""; color: store.textColor; font.pixelSize: 14; font.weight: Font.DemiBold }
                Text { text: "包含：" + (store.incomingSync.noteCount || 0) + " 篇便签 · " + (store.incomingSync.projectCount || 0) + " 个分类"; color: store.faintColor; font.pixelSize: 11; font.family: "Noto Sans Mono CJK SC" }
                Rectangle {
                    width: parent.width
                    radius: 16
                    color: store.primarySoft
                    border.color: store.primaryColor
                    implicitHeight: modeCol.implicitHeight + 16
                    Column {
                        id: modeCol
                        width: parent.width - 20
                        x: 10; y: 8
                        Text { text: root.modeLabel(); color: store.primaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        Text { text: root.modeDesc(); color: store.secondaryColor; font.pixelSize: 12; wrapMode: Text.WordWrap; width: parent.width }
                    }
                }
                Text { text: "本机当前便签：" + store.noteCount + " 篇 (" + store.projectCount + " 分类)    对方便签：" + (store.incomingSync.noteCount || 0) + " 篇"; color: store.secondaryColor; font.pixelSize: 12 }
            }
            Row {
                width: parent.width - 24
                x: 12
                height: 56
                spacing: 8
                Rectangle {
                    width: (parent.width - 8) / 2
                    height: 40
                    radius: 12
                    border.color: store.borderColor
                    Text { anchors.centerIn: parent; text: root.submitting ? "同步处理中..." : ("拒绝同步 (" + root.countdown + "s)"); color: store.secondaryColor; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; enabled: !root.submitting; onClicked: store.rejectSync() }
                }
                Rectangle {
                    width: (parent.width - 8) / 2
                    height: 40
                    radius: 12
                    color: "#059669"
                    Text { anchors.centerIn: parent; text: root.submitting ? "正在同步..." : "允许并立即同步"; color: "white"; font.pixelSize: 12; font.weight: Font.DemiBold }
                    MouseArea { anchors.fill: parent; enabled: !root.submitting; onClicked: { root.submitting = true; store.acceptSync() } }
                }
            }
        }
    }
}
