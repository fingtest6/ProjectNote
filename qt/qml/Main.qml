import QtQuick
import QtQuick.Controls
import QtQuick.Window

ApplicationWindow {
    id: win
    width: 1200
    height: 800
    minimumWidth: 700
    minimumHeight: 500
    visible: true
    title: "项目便签"
    color: store.bgColor
    font.family: "Noto Sans CJK SC"
    font.pixelSize: 14

    property var editingNote: null
    property bool editorOpen: false
    property var viewingNote: null
    property bool detailOpen: false
    property var historyNote: null
    property bool historyOpen: false
    property var exportNote: null
    property bool exportOpen: false
    property string confirmTitle: ""
    property string confirmBody: ""
    property bool confirmOpen: false
    property var confirmAction: null

    function ask(title, body, action) {
        confirmTitle = title
        confirmBody = body
        confirmAction = action
        confirmOpen = true
    }
    function closeTop() {
        if (confirmOpen) { confirmOpen = false; return }
        if (store.hasIncoming) { store.rejectSync(); return }
        if (store.hasSyncReport) { store.dismissReport(); return }
        if (themeDialog.opened) { themeDialog.opened = false; return }
        if (exporter.opened) { exporter.opened = false; return }
        if (diffDialog.opened) { diffDialog.opened = false; return }
        if (editor.opened) { editor.opened = false; return }
        if (detail.opened) { detail.opened = false; return }
        if (drawer.opened) { drawer.opened = false; return }
        if (syncDialog.opened) { syncDialog.opened = false; return }
    }

    Shortcut { sequence: "Esc"; onActivated: win.closeTop() }
    Shortcut { sequence: "Ctrl+F"; onActivated: store.toggleSearch() }
    Shortcut { sequence: "Ctrl+N"; onActivated: { editor.note = null; editor.opened = true } }

    Rectangle {
        id: header
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: headerCol.implicitHeight
        color: store.headerColor
        z: 2
        Column {
            id: headerCol
            width: parent.width
            Rectangle {
                width: parent.width
                height: 56
                color: "transparent"
                Item {
                    width: Math.min(896, parent.width)
                    height: parent.height
                    anchors.horizontalCenter: parent.horizontalCenter
                    Rectangle {
                        anchors.left: parent.left
                        anchors.leftMargin: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(280, projLabel.implicitWidth + 48)
                        height: 40
                        radius: 12
                        color: store.dark ? "#3f3f4680" : "#f1f5f9cc"
                        border.color: store.dark ? "#3f3f46" : "#e2e8f0"
                        Row {
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.left: parent.left
                            anchors.leftMargin: 10
                            spacing: 8
                            Rectangle { width: 12; height: 12; radius: 6; color: store.activeProject.color || store.primaryColor; anchors.verticalCenter: parent.verticalCenter; border.color: store.dark ? "#18181b" : "white"; border.width: 2 }
                            Column {
                                id: projLabel
                                spacing: 0
                                Text { text: "当前项目"; color: store.faintColor; font.pixelSize: 10; font.weight: Font.DemiBold; font.capitalization: Font.AllUppercase }
                                Text { text: (store.activeProject.name || "所有项目") + (drawer.opened ? "  ˄" : "  ˅"); color: store.textColor; font.pixelSize: 13; font.weight: Font.DemiBold }
                            }
                        }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: drawer.opened = !drawer.opened }
                    }
                    Row {
                        anchors.right: parent.right
                        anchors.rightMargin: 12
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 4
                        Repeater {
                            model: [
                                { icon: "⌕", tip: "搜索便签", on: store.searchOpen, act: "search" },
                                { icon: store.dark ? "☀" : "☾", tip: store.dark ? "切换到浅色模式" : "切换到深色模式", on: false, act: "dark" },
                                { icon: "🎨", tip: "自定义主题色", on: false, act: "theme" },
                                { icon: "⇄", tip: "电脑手机互联与外部存储", on: false, act: "sync" }
                            ]
                            delegate: Rectangle {
                                required property var modelData
                                width: 36
                                height: 36
                                radius: 12
                                color: modelData.on ? store.primarySoft : (btnHover.hovered ? store.chipColor : "transparent")
                                border.color: modelData.on ? store.primaryColor : "transparent"
                                Text { anchors.centerIn: parent; text: modelData.icon; color: modelData.on ? store.primaryColor : store.mutedColor; font.pixelSize: 16 }
                                HoverHandler { id: btnHover }
                                ToolTip.visible: btnHover.hovered
                                ToolTip.text: modelData.tip
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        if (modelData.act === "search") store.toggleSearch()
                                        else if (modelData.act === "dark") store.toggleDarkMode()
                                        else if (modelData.act === "theme") themeDialog.opened = true
                                        else syncDialog.opened = true
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Item {
                visible: store.searchOpen
                width: Math.min(896, parent.width)
                height: visible ? searchCol.implicitHeight + 8 : 0
                anchors.horizontalCenter: parent.horizontalCenter
                Column {
                    id: searchCol
                    width: parent.width - 32
                    x: 16
                    spacing: 8
                    TextField {
                        id: searchField
                        width: parent.width
                        placeholderText: store.globalSearch ? "全局搜索所有项目的便签标题或正文..." : "搜索当前项目便签标题或正文..."
                        text: store.searchQuery
                        color: store.textColor
                        font.pixelSize: 13
                        leftPadding: 32
                        onTextChanged: if (text !== store.searchQuery) store.searchQuery = text
                        background: Rectangle { radius: 12; color: store.dark ? "#27272acc" : "#f1f5f9e6"; border.color: searchField.activeFocus ? store.primaryColor : store.borderColor }
                        Text { anchors.left: parent.left; anchors.leftMargin: 10; anchors.verticalCenter: parent.verticalCenter; text: "⌕"; color: store.faintColor }
                        Text {
                            visible: searchField.text !== ""
                            anchors.right: parent.right
                            anchors.rightMargin: 8
                            anchors.verticalCenter: parent.verticalCenter
                            text: "清除"
                            color: store.secondaryColor
                            font.pixelSize: 11
                            MouseArea { anchors.fill: parent; onClicked: store.searchQuery = "" }
                        }
                    }
                    Row {
                        spacing: 8
                        Text { text: "搜索范围："; color: store.faintColor; font.pixelSize: 11; anchors.verticalCenter: parent.verticalCenter }
                        Rectangle {
                            width: 148
                            height: 26
                            radius: 8
                            color: store.chipColor
                            border.color: store.borderColor
                            Row {
                                anchors.fill: parent
                                anchors.margins: 2
                                Rectangle {
                                    width: parent.width / 2
                                    height: parent.height
                                    radius: 6
                                    color: !store.globalSearch ? store.surfaceColor : "transparent"
                                    Text { anchors.centerIn: parent; text: "当前项目"; font.pixelSize: 11; font.weight: !store.globalSearch ? Font.DemiBold : Font.Medium; color: store.textColor }
                                    MouseArea { anchors.fill: parent; onClicked: if (store.globalSearch) store.toggleGlobalSearch() }
                                }
                                Rectangle {
                                    width: parent.width / 2
                                    height: parent.height
                                    radius: 6
                                    color: store.globalSearch ? store.surfaceColor : "transparent"
                                    Text { anchors.centerIn: parent; text: "全部项目"; font.pixelSize: 11; font.weight: store.globalSearch ? Font.DemiBold : Font.Medium; color: store.globalSearch ? store.primaryColor : store.mutedColor }
                                    MouseArea { anchors.fill: parent; onClicked: if (!store.globalSearch) store.toggleGlobalSearch() }
                                }
                            }
                        }
                    }
                }
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: store.dark ? "#27272a" : "#e2e8f0" }
    }

    Flickable {
        id: scroller
        anchors.top: header.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        contentWidth: width
        contentHeight: page.implicitHeight + 24
        clip: true
        Column {
            id: page
            width: Math.min(896, scroller.width)
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 20
            bottomPadding: 110
            leftPadding: 16
            rightPadding: 16
            spacing: 14

            Item {
                width: parent.width - 32
                height: 28
                Rectangle { width: 8; height: 8; radius: 4; anchors.verticalCenter: parent.verticalCenter; color: (store.globalSearch && store.searchQuery) ? store.primaryColor : (store.activeProject.color || store.primaryColor) }
                Text {
                    x: 16
                    anchors.verticalCenter: parent.verticalCenter
                    text: (store.globalSearch && store.searchQuery) ? "全局搜索" : (store.activeProject.name || "便签列表")
                    color: store.secondaryColor
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                }
                Rectangle {
                    x: 16 + titleMeasure.implicitWidth + 8
                    anchors.verticalCenter: parent.verticalCenter
                    height: 18
                    radius: 9
                    color: store.dark ? "#27272a" : "#e2e8f099"
                    width: countText.implicitWidth + 14
                    Text { id: countText; anchors.centerIn: parent; text: store.visibleCount; color: store.mutedColor; font.pixelSize: 11; font.family: "Noto Sans Mono CJK SC"; font.weight: Font.Medium }
                }
                Text { id: titleMeasure; visible: false; text: (store.globalSearch && store.searchQuery) ? "全局搜索" : (store.activeProject.name || "便签列表"); font.pixelSize: 14; font.weight: Font.DemiBold }
                Rectangle {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    width: 92
                    height: 28
                    radius: 12
                    color: store.chipColor
                    border.color: store.borderColor
                    Text { anchors.centerIn: parent; text: "导入 .md"; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.Medium }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.importMarkdown() }
                }
            }

            Text {
                visible: store.searchQuery !== ""
                text: "匹配「" + store.searchQuery + "」"
                color: store.primaryColor
                font.pixelSize: 11
                font.weight: Font.Medium
            }

            Rectangle {
                visible: store.visibleCount === 0
                width: Math.min(384, parent.width - 32)
                anchors.horizontalCenter: parent.horizontalCenter
                radius: 24
                color: store.dark ? "#18181b66" : "#ffffff99"
                border.color: store.borderColor
                border.width: 1
                implicitHeight: emptyCol.implicitHeight + 48
                Column {
                    id: emptyCol
                    width: parent.width - 48
                    anchors.centerIn: parent
                    spacing: 8
                    Rectangle {
                        width: 56; height: 56; radius: 16; color: store.primarySoft; anchors.horizontalCenter: parent.horizontalCenter
                        Text { anchors.centerIn: parent; text: "📝"; font.pixelSize: 26 }
                    }
                    Text { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: store.searchQuery ? "未找到匹配便签" : "当前项目暂无便签"; color: store.secondaryColor; font.pixelSize: 15; font.weight: Font.DemiBold }
                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        text: store.searchQuery ? "建议检查拼写或切换至全局搜索查看其他项目。" : "开始记录当前项目灵感，或直接从本地导入已有 Markdown 笔记。"
                        color: store.faintColor
                        font.pixelSize: 12
                    }
                    Row {
                        visible: store.searchQuery === ""
                        anchors.horizontalCenter: parent.horizontalCenter
                        spacing: 8
                        Rectangle {
                            width: 110; height: 36; radius: 12; color: store.primaryColor
                            Text { anchors.centerIn: parent; text: "新建便签"; color: "white"; font.pixelSize: 12; font.weight: Font.DemiBold }
                            MouseArea { anchors.fill: parent; onClicked: { editor.note = null; editor.opened = true } }
                        }
                        Rectangle {
                            width: 100; height: 36; radius: 12; color: store.chipColor; border.color: store.borderColor
                            Text { anchors.centerIn: parent; text: "导入 .md"; color: store.secondaryColor; font.pixelSize: 12 }
                            MouseArea { anchors.fill: parent; onClicked: win.importMarkdown() }
                        }
                    }
                }
            }

            Flow {
                id: flow
                width: parent.width - 32
                spacing: 14
                visible: store.visibleCount > 0
                Repeater {
                    model: store.visibleNotes
                    delegate: NoteCard {
                        required property var item
                        width: flow.width > 680 ? (flow.width - 14) / 2 : flow.width
                        note: item
                        project: (store.globalSearch && store.searchQuery) ? store.projectById(item.projectId) : null
                        onOpenRequested: { win.viewingNote = item; detail.opened = true }
                        onEditRequested: { editor.note = item; detail.opened = false; editor.opened = true }
                        onDuplicateRequested: store.duplicateNote(item.id)
                        onDeleteRequested: win.ask("删除便签", "确定要删除便签「" + (item.title || "无标题便签") + "」吗？", function() { store.deleteNote(item.id) })
                        onPinRequested: {
                            const updated = store.togglePin(item.id)
                            if (win.viewingNote && win.viewingNote.id === item.id) win.viewingNote = updated
                        }
                        onHistoryRequested: { diffDialog.note = item; diffDialog.opened = true }
                        onExportRequested: { exporter.note = item; exporter.opened = true }
                    }
                }
            }
        }
    }

    Rectangle {
        z: 3
        width: win.width >= 640 ? 64 : 56
        height: width
        radius: width / 2
        color: store.primaryColor
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.rightMargin: 24
        anchors.bottomMargin: 24
        Text { anchors.centerIn: parent; text: "+"; color: "white"; font.pixelSize: 32; font.weight: Font.Normal }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { editor.note = null; editor.opened = true } }
    }

    ProjectDrawer {
        id: drawer
        z: 40
        onAlertNeed: (message) => win.ask("无法删除", message, null)
        onAskDelete: (id, name, count) => win.ask("删除项目", "确定要删除项目「" + name + "」吗？" + (count > 0 ? ("该项目下的 " + count + " 条便签也将被同步删除！") : ""), function() { store.deleteProject(id) })
    }
    ThemeDialog { id: themeDialog; z: 50 }
    NoteEditor {
        id: editor
        z: 50
        onLinkOpened: (id) => win.openNote(id)
    }
    NoteDetail {
        id: detail
        z: 50
        onEditRequested: (n) => { editor.note = n; detail.opened = false; editor.opened = true }
        onDuplicateRequested: (n) => { store.duplicateNote(n.id); detail.opened = false }
        onDeleteRequested: (id) => win.ask("删除便签", "确定要删除这条便签吗？", function() { store.deleteNote(id); detail.opened = false })
        onPinRequested: (n) => { detail.note = store.togglePin(n.id) }
        onHistoryRequested: (n) => { diffDialog.note = n; diffDialog.opened = true }
        onExportRequested: (n) => { exporter.note = n; exporter.opened = true }
        onNavigateRequested: (id) => win.openNote(id)
    }
    GitDiffDialog {
        id: diffDialog
        z: 60
        onRestoreAsked: (historyId, version, message) => win.ask("回退版本", "确定要直接回滚到「版本 v" + version + " (" + message + ")」吗？\n回滚后将直接恢复至该版本状态，不会新增额外提交记录。", function() {
            const restored = store.restoreVersion(historyId)
            if (restored && restored.id) {
                if (detail.note && detail.note.id === restored.id) detail.note = restored
                diffDialog.note = restored
            }
            diffDialog.opened = false
        })
    }
    ExportDialog {
        id: exporter
        z: 60
    }
    SyncDialog { id: syncDialog; z: 50 }
    SyncReportDialog {
        z: 60
        onUndoAsked: win.ask("撤销本次同步", "将把本机数据恢复到本次同步之前，自本次同步后在本机的修改会丢失。\n\n注意：仅回滚本机，对方设备不会自动回滚。确定撤销吗？", function() { store.undoSync(); store.dismissReport() })
    }
    SyncConfirmDialog { z: 70 }

    Rectangle {
        visible: confirmOpen
        anchors.fill: parent
        z: 80
        color: "#99000000"
        Rectangle {
            width: Math.min(420, parent.width - 40)
            anchors.centerIn: parent
            radius: 16
            color: store.surfaceColor
            border.color: store.borderColor
            implicitHeight: confirmCol.implicitHeight + 24
            Column {
                id: confirmCol
                width: parent.width - 32
                x: 16
                y: 16
                spacing: 12
                Text { text: win.confirmTitle; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { width: parent.width; text: win.confirmBody; color: store.secondaryColor; font.pixelSize: 13; wrapMode: Text.WordWrap }
                Row {
                    spacing: 8
                    anchors.right: parent.right
                    Rectangle {
                        visible: win.confirmAction !== null
                        width: 72; height: 32; radius: 10; border.color: store.borderColor
                        Text { anchors.centerIn: parent; text: "取消"; color: store.secondaryColor; font.pixelSize: 12 }
                        MouseArea { anchors.fill: parent; onClicked: win.confirmOpen = false }
                    }
                    Rectangle {
                        width: 72; height: 32; radius: 10; color: store.primaryColor
                        Text { anchors.centerIn: parent; text: win.confirmAction ? "确定" : "知道了"; color: "white"; font.pixelSize: 12 }
                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                const action = win.confirmAction
                                win.confirmOpen = false
                                if (action) action()
                            }
                        }
                    }
                }
            }
        }
    }

    function importMarkdown() {
        const path = store.pickMarkdownFile()
        if (!path) return
        const saved = store.importMarkdownPath(path)
        if (saved && saved.error) ask("无法导入", saved.error, null)
    }
    function openNote(id) {
        const target = store.noteById(id)
        if (!target || !target.id) {
            ask("未找到便签", "未找到被引用的便签，该便签可能已被删除。", null)
            return
        }
        store.selectProject(target.projectId)
        detail.note = target
        detail.opened = true
    }

    Connections {
        target: store
        function onNotesChanged() {
            if (detail.note && detail.note.id) {
                const fresh = store.noteById(detail.note.id)
                detail.note = fresh && fresh.id ? fresh : null
                if (!detail.note) detail.opened = false
            }
        }
    }
}
