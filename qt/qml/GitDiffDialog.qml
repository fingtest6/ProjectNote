import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    property var note: null
    property var histories: []
    property string selectedId: ""
    property string compareMode: "previous"
    visible: opened && note
    anchors.fill: parent

    function reload() {
        histories = note ? store.histories(note.id) : []
        if (!selectedId && histories.length)
            selectedId = histories[0].id
    }
    onOpenedChanged: if (opened) reload()

    function selected() {
        for (let i = 0; i < histories.length; ++i)
            if (histories[i].id === selectedId) return histories[i]
        return histories.length ? histories[0] : null
    }
    function previousOf(h) {
        if (!h) return null
        for (let i = 0; i < histories.length; ++i)
            if (histories[i].version === h.version - 1) return histories[i]
        return null
    }
    function diffResult() {
        const h = selected()
        if (!h) return store.diff("", note ? note.content : "")
        if (compareMode === "current")
            return store.diff(h.content, note.content)
        const prev = previousOf(h)
        return store.diff(prev ? prev.content : "", h.content)
    }
    function compareLabel() {
        const h = selected()
        if (!h) return ""
        if (compareMode === "current")
            return "对比：版本 v" + h.version + " ➔ 当前最新版本"
        const prev = previousOf(h)
        return prev ? ("对比：版本 v" + prev.version + " ➔ 版本 v" + h.version) : ("版本 v" + h.version + "（初始创建）")
    }

    Rectangle { anchors.fill: parent; color: "#99000000"; MouseArea { anchors.fill: parent; onClicked: root.opened = false } }
    Rectangle {
        width: Math.min(896, parent.width - 16)
        height: Math.min(parent.height * 0.9, 820)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 64
                color: store.dark ? "#27272a" : "#f8fafc"
                Column {
                    anchors.left: parent.left; anchors.leftMargin: 16; anchors.verticalCenter: parent.verticalCenter
                    Text { text: "修改历史与 Git 差异查看"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                    Text { text: "便签：" + (root.note ? root.note.title : ""); color: store.faintColor; font.pixelSize: 12 }
                }
                Text { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: store.faintColor }
                MouseArea { anchors.right: parent.right; width: 40; height: parent.height; onClicked: root.opened = false }
            }
            Row {
                width: parent.width
                height: parent.height - 64
                Rectangle {
                    width: 280
                    height: parent.height
                    color: store.dark ? "#09090b" : "#f8fafc"
                    Column {
                        anchors.fill: parent
                        Text { text: "版本提交历史"; color: store.faintColor; font.pixelSize: 11; font.weight: Font.DemiBold; leftPadding: 12; topPadding: 10 }
                        ListView {
                            width: parent.width
                            height: parent.height - 28
                            clip: true
                            model: root.histories
                            delegate: Rectangle {
                                required property var modelData
                                width: ListView.view.width - 12
                                x: 6
                                height: 72
                                radius: 12
                                color: modelData.id === root.selectedId ? store.surfaceColor : "transparent"
                                border.color: modelData.id === root.selectedId ? store.primaryColor : "transparent"
                                Column {
                                    anchors.fill: parent
                                    anchors.margins: 8
                                    spacing: 4
                                    Row {
                                        spacing: 8
                                        Rectangle {
                                            width: 36; height: 18; radius: 6
                                            color: modelData.id === root.selectedId ? store.primaryColor : store.chipColor
                                            Text { anchors.centerIn: parent; text: "v" + modelData.version; color: modelData.id === root.selectedId ? "white" : store.secondaryColor; font.pixelSize: 11; font.bold: true }
                                        }
                                        Text { text: store.formatTime(modelData.timestamp, false); color: store.faintColor; font.pixelSize: 11 }
                                    }
                                    Text { text: modelData.commitMessage || "更新便签"; color: store.secondaryColor; font.pixelSize: 12; elide: Text.ElideRight; width: parent.width }
                                    Text { text: (modelData.charCount || 0) + " 字符"; color: store.faintColor; font.pixelSize: 11 }
                                }
                                MouseArea { anchors.fill: parent; onClicked: root.selectedId = modelData.id }
                            }
                        }
                    }
                }
                Column {
                    width: parent.width - 280
                    height: parent.height
                    Rectangle {
                        width: parent.width
                        height: 48
                        color: store.dark ? "#18181b" : "#fafafa"
                        Row {
                            anchors.fill: parent
                            anchors.margins: 8
                            spacing: 8
                            Text { text: root.compareLabel(); color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter }
                            Rectangle { width: 42; height: 20; radius: 4; color: store.dark ? "#052e16" : "#d1fae5"; Text { anchors.centerIn: parent; text: "+" + root.diffResult().additions; color: "#047857"; font.pixelSize: 11 } }
                            Rectangle { width: 42; height: 20; radius: 4; color: store.dark ? "#4c0519" : "#ffe4e6"; Text { anchors.centerIn: parent; text: "-" + root.diffResult().deletions; color: "#be123c"; font.pixelSize: 11 } }
                            Item { width: 8; height: 1 }
                            Rectangle {
                                width: 78; height: 26; radius: 6
                                color: root.compareMode === "previous" ? store.surfaceColor : "transparent"
                                Text { anchors.centerIn: parent; text: "对比上一版"; font.pixelSize: 11; color: store.secondaryColor }
                                MouseArea { anchors.fill: parent; onClicked: root.compareMode = "previous" }
                            }
                            Rectangle {
                                width: 78; height: 26; radius: 6
                                color: root.compareMode === "current" ? store.surfaceColor : "transparent"
                                Text { anchors.centerIn: parent; text: "对比最新版"; font.pixelSize: 11; color: store.secondaryColor }
                                MouseArea { anchors.fill: parent; onClicked: root.compareMode = "current" }
                            }
                            Rectangle {
                                width: 108; height: 28; radius: 8; color: store.primaryColor
                                Text { anchors.centerIn: parent; text: "回退到此版本"; color: "white"; font.pixelSize: 12 }
                                MouseArea { anchors.fill: parent; onClicked: root.askRestore() }
                            }
                        }
                    }
                    ListView {
                        width: parent.width
                        height: parent.height - 48
                        clip: true
                        model: root.diffResult().lines
                        delegate: Rectangle {
                            required property var modelData
                            width: ListView.view.width
                            height: lineText.implicitHeight + 6
                            color: modelData.type === "added" ? (store.dark ? "#052e16" : "#ecfdf5") : (modelData.type === "removed" ? (store.dark ? "#4c0519" : "#fff1f2") : "transparent")
                            Row {
                                anchors.fill: parent
                                spacing: 4
                                Text { width: 28; text: modelData.oldLineNumber || ""; color: store.faintColor; font.pixelSize: 10; font.family: "Noto Sans Mono CJK SC"; horizontalAlignment: Text.AlignRight }
                                Text { width: 28; text: modelData.newLineNumber || ""; color: store.faintColor; font.pixelSize: 10; font.family: "Noto Sans Mono CJK SC"; horizontalAlignment: Text.AlignRight }
                                Text { width: 14; text: modelData.type === "added" ? "+" : (modelData.type === "removed" ? "-" : " "); color: modelData.type === "added" ? "#059669" : "#e11d48"; font.pixelSize: 12 }
                                Text { id: lineText; text: modelData.content || " "; color: store.secondaryColor; font.pixelSize: 12; font.family: "Noto Sans Mono CJK SC"; width: parent.width - 90; wrapMode: Text.Wrap }
                            }
                        }
                    }
                }
            }
        }
    }
    signal restoreAsked(string historyId, int version, string message)
    function askRestore() {
        const h = selected()
        if (!h) return
        restoreAsked(h.id, h.version, h.commitMessage || "")
    }
}
