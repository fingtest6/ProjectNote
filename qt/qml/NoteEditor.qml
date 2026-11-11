import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    property var note: null
    anchors.fill: parent
    visible: opened

    function resetFromNote() {
        titleField.text = note ? (note.title || "") : ""
        area.text = note ? (note.content || "") : ""
        projectBox.currentIndex = 0
        const wanted = note ? note.projectId : store.activeProjectId
        for (let i = 0; i < projectBox.count; ++i) {
            if (store.projects.at(i).id === wanted)
                projectBox.currentIndex = i
        }
        pinned = note ? !!note.pinned : false
        images = note && note.images ? note.images.slice() : []
        commitMessage = ""
        showCommit = false
        preview = false
    }

    onOpenedChanged: if (opened) resetFromNote()

    property bool pinned: false
    property var images: []
    property string commitMessage: ""
    property bool showCommit: false
    property bool preview: false
    property string previewImage: ""

    Rectangle { anchors.fill: parent; color: "#99000000" }

    Rectangle {
        anchors.centerIn: parent
        width: Math.min(768, parent.width - 16)
        height: Math.min(parent.height * 0.9, parent.height - 16)
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true

        Column {
            anchors.fill: parent
            spacing: 0
            Rectangle {
                width: parent.width
                height: 48
                color: store.dark ? "#18181b" : "#f8fafc"
                Row {
                    anchors.fill: parent
                    anchors.leftMargin: 8
                    anchors.rightMargin: 12
                    spacing: 8
                    Rectangle {
                        width: 32; height: 32; radius: 12; anchors.verticalCenter: parent.verticalCenter
                        Text { anchors.centerIn: parent; text: "✕"; color: store.mutedColor }
                        MouseArea { anchors.fill: parent; onClicked: root.opened = false }
                    }
                    Item { width: parent.width - 220; height: 1 }
                    Rectangle {
                        width: 72; height: 32; radius: 12; anchors.verticalCenter: parent.verticalCenter
                        color: root.preview ? store.primarySoft : store.chipColor
                        border.color: root.preview ? store.primaryColor : "transparent"
                        Text { anchors.centerIn: parent; text: root.preview ? "编辑" : "预览"; color: root.preview ? store.primaryColor : store.secondaryColor; font.pixelSize: 12 }
                        MouseArea { anchors.fill: parent; onClicked: root.preview = !root.preview }
                    }
                    Rectangle {
                        width: 72; height: 32; radius: 12; anchors.verticalCenter: parent.verticalCenter
                        color: store.primaryColor
                        Text { anchors.centerIn: parent; text: "保存"; color: "white"; font.pixelSize: 12; font.weight: Font.Medium }
                        MouseArea { anchors.fill: parent; onClicked: root.save() }
                    }
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: store.borderColor }
            }

            Row {
                width: parent.width
                height: 40
                leftPadding: 16
                spacing: 8
                ComboBox {
                    id: projectBox
                    width: 180
                    height: 30
                    model: store.projects
                    textRole: "name"
                    font.pixelSize: 12
                    contentItem: Text {
                        leftPadding: 10
                        text: projectBox.displayText ? ("📁 " + projectBox.displayText) : "📁"
                        color: store.secondaryColor
                        font.pixelSize: 12
                        verticalAlignment: Text.AlignVCenter
                        elide: Text.ElideRight
                    }
                    background: Rectangle { radius: 12; color: store.chipColor; border.color: store.borderColor }
                }
                Rectangle {
                    width: 78; height: 30; radius: 12
                    color: root.pinned ? "#fef3c7" : store.chipColor
                    border.color: root.pinned ? "#f59e0b" : store.borderColor
                    Text { anchors.centerIn: parent; text: root.pinned ? "📌 已置顶" : "📌 置顶"; color: root.pinned ? "#d97706" : store.mutedColor; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; onClicked: root.pinned = !root.pinned }
                }
                Rectangle {
                    width: 88; height: 30; radius: 12
                    color: root.showCommit || root.commitMessage ? store.primarySoft : store.chipColor
                    border.color: root.showCommit || root.commitMessage ? store.primaryColor : store.borderColor
                    Text { anchors.centerIn: parent; text: root.commitMessage ? "已填备注" : "修改备注"; color: root.showCommit || root.commitMessage ? store.primaryColor : store.mutedColor; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; onClicked: root.showCommit = !root.showCommit }
                }
            }

            TextField {
                visible: root.showCommit
                width: parent.width - 32
                x: 16
                placeholderText: "输入本次修改备注 (如：修改待办事项、补充设计要点)..."
                text: root.commitMessage
                onTextChanged: root.commitMessage = text
                color: store.textColor
                font.pixelSize: 12
                background: Rectangle { radius: 12; color: store.primarySoft; border.color: store.primaryColor }
            }

            TextField {
                id: titleField
                width: parent.width
                placeholderText: "便签标题..."
                font.pixelSize: 22
                font.weight: Font.Bold
                color: store.textColor
                leftPadding: 20
                background: Rectangle { color: "transparent" }
            }

            Flickable {
                id: tools
                visible: !root.preview
                width: parent.width
                height: visible ? 36 : 0
                contentWidth: toolRow.width
                clip: true
                Row {
                    id: toolRow
                    height: 36
                    spacing: 4
                    leftPadding: 8
                    function prefix(p) { const r = store.applyLinePrefix(area.text, area.selectionStart, area.selectionEnd, p); area.text = r.text; area.select(r.start, r.end) }
                    function wrap(tag, holder) { const r = store.wrapSelection(area.text, area.selectionStart, area.selectionEnd, tag, holder); area.text = r.text; area.select(r.start, r.end) }
                    component Tool: Rectangle {
                        property string label
                        property string tip
                        signal clicked()
                        width: Math.max(28, labelText.implicitWidth + 12)
                        height: 28
                        radius: 6
                        color: toolHover.hovered ? store.chipColor : "transparent"
                        Text { id: labelText; anchors.centerIn: parent; text: label; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        HoverHandler { id: toolHover }
                        ToolTip.visible: toolHover.hovered
                        ToolTip.text: tip
                        MouseArea { anchors.fill: parent; onClicked: parent.clicked() }
                    }
                    Tool { label: "H1"; tip: "切换一级标题"; onClicked: toolRow.prefix("# ") }
                    Tool { label: "H2"; tip: "切换二级标题"; onClicked: toolRow.prefix("## ") }
                    Tool { label: "B"; tip: "粗体"; onClicked: toolRow.wrap("**", "粗体") }
                    Tool { label: "I"; tip: "斜体"; onClicked: toolRow.wrap("*", "斜体") }
                    Tool { label: "S"; tip: "删除线"; onClicked: toolRow.wrap("~~", "删除线") }
                    Tool { label: "☑"; tip: "切换待办清单"; onClicked: toolRow.prefix("- [ ] ") }
                    Tool { label: "•"; tip: "切换无序列表"; onClicked: toolRow.prefix("- ") }
                    Tool { label: "❝"; tip: "切换引用块"; onClicked: toolRow.prefix("> ") }
                    Tool { label: "<>"; tip: "行内代码"; onClicked: toolRow.wrap("`", "代码") }
                    Tool { label: "引用便签"; tip: "引用其他项目/便签记录"; onClicked: picker.opened = true }
                    Tool { label: "添加图片"; tip: "插入图片"; onClicked: root.addImages() }
                    Tool { label: "导入 .md"; tip: "从本地导入 Markdown 文件到当前便签"; onClicked: root.importInto() }
                }
            }

            Flickable {
                width: parent.width
                height: parent.height - y
                contentHeight: previewCol.implicitHeight
                clip: true
                Column {
                    id: previewCol
                    width: parent.width
                    padding: 16
                    spacing: 12
                    TextArea {
                        id: area
                        visible: !root.preview
                        width: parent.width - 32
                        height: Math.max(260, root.parent ? 260 : 260)
                        placeholderText: "撰写 Markdown 内容，支持待办清单、标题、代码与便签双链引用..."
                        wrapMode: TextArea.Wrap
                        selectByMouse: true
                        color: store.secondaryColor
                        font.pixelSize: 14
                        background: Rectangle { color: "transparent" }
                        Keys.onPressed: (event) => {
                            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                                const r = store.smartEnter(area.text, area.cursorPosition)
                                if (r.handled) {
                                    area.text = r.text
                                    area.cursorPosition = r.cursor
                                    event.accepted = true
                                }
                            } else if (event.key === Qt.Key_Tab) {
                                const r = store.insertIndent(area.text, area.cursorPosition)
                                area.text = r.text
                                area.cursorPosition = r.cursor
                                event.accepted = true
                            } else if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_V) {
                                const img = store.clipboardImage()
                                if (img) {
                                    root.images = root.images.concat([img])
                                    event.accepted = true
                                }
                            }
                        }
                    }
                    Text {
                        visible: root.preview
                        width: parent.width - 32
                        textFormat: Text.RichText
                        text: store.markdownHtml(area.text)
                        wrapMode: Text.WordWrap
                        color: store.secondaryColor
                        onLinkActivated: (link) => { if (String(link).indexOf("note:") === 0) root.linkOpened(String(link).substring(5)) }
                    }
                    Column {
                        visible: root.images.length > 0
                        width: parent.width - 32
                        spacing: 8
                        Text { text: "图片附件 (" + root.images.length + " 张)"; color: store.mutedColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        Flow {
                            width: parent.width
                            spacing: 8
                            Repeater {
                                model: root.images
                                delegate: Rectangle {
                                    required property string modelData
                                    required property int index
                                    width: 80; height: 80; radius: 12; color: store.chipColor; clip: true
                                    Image {
                                        anchors.fill: parent
                                        fillMode: Image.PreserveAspectCrop
                                        source: {
                                            const list = root.imageFiles()
                                            return list[index] || ""
                                        }
                                        MouseArea { anchors.fill: parent; onClicked: root.previewImage = store.cacheImage(modelData) }
                                    }
                                    Rectangle {
                                        width: 20; height: 20; radius: 6; color: "#99000000"
                                        anchors.right: parent.right; anchors.top: parent.top; anchors.margins: 4
                                        Text { anchors.centerIn: parent; text: "✕"; color: "white"; font.pixelSize: 10 }
                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: {
                                                const next = root.images.slice()
                                                next.splice(index, 1)
                                                root.images = next
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    property var fileCache: ({})
    function imageFiles() {
        const out = []
        for (let i = 0; i < images.length; ++i) {
            if (String(images[i]).indexOf("data:image") === 0) {
                const saved = store.cacheImage(images[i])
                out.push(saved)
            } else {
                out.push(images[i])
            }
        }
        return out
    }

    function addImages() {
        const picked = store.pickImages()
        if (picked && picked.length)
            images = images.concat(picked)
    }
    function importInto() {
        const path = store.pickMarkdownFile()
        if (!path) return
        const text = store.readTextFile(path)
        const name = path.split("/").pop()
        if (!titleField.text.trim() && name)
            titleField.text = name.replace(/\.(md|markdown|txt)$/i, "")
        area.text = area.text.trim() ? (area.text + "\n\n" + text) : text
    }
    function save() {
        const title = titleField.text.trim() || "无标题便签"
        const message = commitMessage.trim() || (note ? ("更新便签「" + title + "」") : ("创建新便签「" + title + "」"))
        const picked = store.projects.at(projectBox.currentIndex)
        const projectId = (picked && picked.id) ? picked.id : store.activeProjectId
        store.saveNote({
            id: note ? note.id : "",
            projectId: projectId,
            title: title,
            content: area.text,
            pinned: pinned,
            images: images
        }, message)
        opened = false
    }

    signal linkOpened(string noteId)

    ReferencePicker {
        id: picker
        currentNoteId: root.note ? root.note.id : ""
        onChosen: (id, title) => {
            const link = "[[" + id + "|" + (title || "便签") + "]]"
            const start = area.selectionStart
            area.text = area.text.substring(0, start) + link + area.text.substring(area.selectionEnd)
            area.cursorPosition = start + link.length
        }
    }

    Rectangle {
        visible: root.previewImage !== ""
        anchors.fill: parent
        color: "#e6000000"
        z: 5
        Image { anchors.centerIn: parent; width: Math.min(parent.width - 40, 900); height: Math.min(parent.height - 40, 700); fillMode: Image.PreserveAspectFit; source: root.previewImage.indexOf("data:") === 0 ? "" : root.previewImage }
        MouseArea { anchors.fill: parent; onClicked: root.previewImage = "" }
    }
}
