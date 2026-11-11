import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    signal projectChosen(string id)

    visible: opened
    anchors.fill: parent
    signal alertNeed(string message)
    signal askDelete(string id, string name, int count)

    Rectangle {
        anchors.fill: parent
        color: "#99000000"
        MouseArea { anchors.fill: parent; onClicked: root.opened = false }
    }

    Rectangle {
        id: sheet
        width: Math.min(448, parent.width - 24)
        height: Math.min(parent.height * 0.85, 640)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true

        property bool creating: false
        property string editingId: ""
        property string formName: ""
        property string formColor: "#10b981"
        property string formDesc: ""
        readonly property var colors: ["#10b981", "#3b82f6", "#8b5cf6", "#f97316", "#f43f5e", "#06b6d4", "#eab308", "#64748b"]

        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width
                height: 52
                color: "transparent"
                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 20
                    anchors.verticalCenter: parent.verticalCenter
                    text: sheet.creating ? (sheet.editingId ? "编辑项目" : "新建项目") : "切换项目空间"
                    color: store.textColor
                    font.pixelSize: 16
                    font.weight: Font.DemiBold
                }
                Rectangle {
                    anchors.right: parent.right
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    width: 32; height: 32; radius: 12
                    color: closeHover.hovered ? store.chipColor : "transparent"
                    Text { anchors.centerIn: parent; text: "✕"; color: store.faintColor; font.pixelSize: 14 }
                    HoverHandler { id: closeHover }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            if (sheet.creating) {
                                sheet.creating = false
                                sheet.editingId = ""
                            } else {
                                root.opened = false
                            }
                        }
                    }
                }
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: store.dark ? "#27272a" : "#f1f5f9" }
            }

            Flickable {
                width: parent.width
                height: parent.height - 52
                contentHeight: formColumn.implicitHeight
                clip: true
                Column {
                    id: formColumn
                    width: parent.width
                    padding: 16
                    spacing: 12

                    Column {
                        visible: sheet.creating
                        width: parent.width - 32
                        spacing: 12
                        Text { text: "项目名称 *"; color: store.mutedColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        TextField {
                            id: nameField
                            width: parent.width
                            text: sheet.formName
                            placeholderText: "例如：工作备忘、考研复习、旅游攻略..."
                            onTextChanged: sheet.formName = text
                            color: store.textColor
                            font.pixelSize: 14
                            leftPadding: 14
                            rightPadding: 14
                            background: Rectangle { radius: 12; color: store.inputColor; border.color: nameField.activeFocus ? store.primaryColor : store.borderColor }
                        }
                        Text { text: "项目主题色"; color: store.mutedColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        Flow {
                            width: parent.width
                            spacing: 8
                            Repeater {
                                model: sheet.colors
                                delegate: Rectangle {
                                    required property string modelData
                                    width: 28; height: 28; radius: 14
                                    color: modelData
                                    border.width: sheet.formColor === modelData ? 2 : 0
                                    border.color: store.dark ? "#a1a1aa" : "#94a3b8"
                                    Text { anchors.centerIn: parent; visible: sheet.formColor === modelData; text: "✓"; color: "white"; font.pixelSize: 12; font.bold: true }
                                    MouseArea { anchors.fill: parent; onClicked: sheet.formColor = modelData }
                                }
                            }
                        }
                        Text { text: "项目描述（可选）"; color: store.mutedColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        TextArea {
                            id: descField
                            width: parent.width
                            height: 64
                            text: sheet.formDesc
                            placeholderText: "简单记录此项目的分类目的..."
                            wrapMode: TextArea.Wrap
                            onTextChanged: sheet.formDesc = text
                            color: store.textColor
                            font.pixelSize: 14
                            background: Rectangle { radius: 12; color: store.inputColor; border.color: descField.activeFocus ? store.primaryColor : store.borderColor }
                        }
                        Row {
                            width: parent.width
                            spacing: 10
                            Rectangle {
                                width: (parent.width - 10) / 2
                                height: 36
                                radius: 12
                                border.color: store.borderColor
                                color: "transparent"
                                Text { anchors.centerIn: parent; text: "取消"; color: store.secondaryColor; font.pixelSize: 12 }
                                MouseArea { anchors.fill: parent; onClicked: { sheet.creating = false; sheet.editingId = "" } }
                            }
                            Rectangle {
                                width: (parent.width - 10) / 2
                                height: 36
                                radius: 12
                                color: store.primaryColor
                                Text { anchors.centerIn: parent; text: sheet.editingId ? "保存修改" : "确认创建"; color: "white"; font.pixelSize: 12; font.weight: Font.Medium }
                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: {
                                        if (!sheet.formName.trim()) return
                                        if (sheet.editingId)
                                            store.updateProject(sheet.editingId, sheet.formName.trim(), sheet.formColor, sheet.formDesc.trim())
                                        else
                                            store.createProject(sheet.formName.trim(), sheet.formColor, sheet.formDesc.trim())
                                        sheet.creating = false
                                        sheet.editingId = ""
                                    }
                                }
                            }
                        }
                    }

                    Column {
                        visible: !sheet.creating
                        width: parent.width - 32
                        spacing: 8
                        Repeater {
                            model: store.projects
                            delegate: Rectangle {
                                required property var item
                                width: parent.width
                                height: 64
                                radius: 12
                                color: item.id === store.activeProjectId ? store.primarySoft : "transparent"
                                border.color: item.id === store.activeProjectId ? store.primaryColor : store.borderColor
                                Row {
                                    anchors.fill: parent
                                    anchors.margins: 10
                                    spacing: 8
                                    Rectangle { width: 12; height: 12; radius: 6; color: item.color || "#10b981"; anchors.verticalCenter: parent.verticalCenter }
                                    Column {
                                        width: parent.width - 150
                                        anchors.verticalCenter: parent.verticalCenter
                                        spacing: 2
                                        Row {
                                            spacing: 6
                                            Text { text: item.name; color: store.textColor; font.pixelSize: 14; font.weight: Font.Medium; elide: Text.ElideRight; width: Math.min(implicitWidth, 180) }
                                            Rectangle {
                                                visible: item.id === store.activeProjectId
                                                width: 36; height: 16; radius: 8; color: store.primaryColor
                                                Text { anchors.centerIn: parent; text: "当前"; color: "white"; font.pixelSize: 10; font.weight: Font.DemiBold }
                                            }
                                        }
                                        Text { visible: item.description; text: item.description || ""; color: store.faintColor; font.pixelSize: 12; elide: Text.ElideRight; width: parent.width }
                                    }
                                    Item { width: 1; height: 1 }
                                    Text {
                                        text: (store.projectNoteCounts[item.id] || 0) + " 篇"
                                        color: store.mutedColor
                                        font.pixelSize: 11
                                        font.family: "Noto Sans Mono CJK SC"
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    Rectangle {
                                        width: 28; height: 28; radius: 8; color: "transparent"
                                        anchors.verticalCenter: parent.verticalCenter
                                        Text { anchors.centerIn: parent; text: "✎"; color: store.faintColor; font.pixelSize: 12 }
                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: {
                                                sheet.editingId = item.id
                                                sheet.formName = item.name
                                                sheet.formColor = item.color || "#10b981"
                                                sheet.formDesc = item.description || ""
                                                sheet.creating = true
                                            }
                                        }
                                    }
                                    Rectangle {
                                        visible: store.projectCount > 1
                                        width: 28; height: 28; radius: 8
                                        anchors.verticalCenter: parent.verticalCenter
                                        Text { anchors.centerIn: parent; text: "🗑"; font.pixelSize: 12 }
                                        MouseArea {
                                            anchors.fill: parent
                                            onClicked: sheet.deleteProject(item.id, item.name, store.projectNoteCounts[item.id] || 0)
                                        }
                                    }
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    z: -1
                                    onClicked: { store.selectProject(item.id); root.opened = false }
                                }
                            }
                        }
                        Rectangle {
                            width: parent.width
                            height: 44
                            radius: 12
                            border.color: store.borderColor
                            border.width: 1
                            color: "transparent"
                            Text { anchors.centerIn: parent; text: "+  新建项目空间"; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                            MouseArea {
                                anchors.fill: parent
                                onClicked: {
                                    sheet.editingId = ""
                                    sheet.formName = ""
                                    sheet.formDesc = ""
                                    sheet.formColor = sheet.colors[Math.floor(Math.random() * sheet.colors.length)]
                                    sheet.creating = true
                                }
                            }
                        }
                    }
                }
            }
        }

        function deleteProject(id, name, count) {
            if (store.projectCount <= 1) {
                root.alertNeed("至少需要保留一个项目！")
                return
            }
            root.askDelete(id, name, count)
        }
    }
}
