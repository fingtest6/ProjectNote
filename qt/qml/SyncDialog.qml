import QtQuick
import QtQuick.Controls

Item {
    id: root
    property bool opened: false
    property string tab: "sync"
    property string mode: "smart-merge"
    property bool editingPin: false
    property string pinDraft: ""
    property string pinError: ""
    property string targetIp: ""
    property string targetPin: "888888"
    property string syncHint: ""
    visible: opened
    anchors.fill: parent

    readonly property var modes: [
        { id: "smart-merge", name: "双向智能合并", badge: "推荐 · 无损", desc: "双方新增互相保留；同一便签按最新编辑时间合并。" },
        { id: "new-only", name: "仅同步新增便签", badge: "安全 · 不覆盖", desc: "仅同步双方各自新增的便签，双方已有便签内容绝不改动。" },
        { id: "push-overwrite", name: "以电脑为准覆盖手机", badge: "完全推送", desc: "用电脑端全部数据覆盖手机，手机现有便签将被替换。" },
        { id: "pull-overwrite", name: "以手机为准覆盖电脑", badge: "完全拉取", desc: "用手机端全部数据覆盖电脑，电脑现有便签将被替换。" }
    ]

    Rectangle { anchors.fill: parent; color: "#99000000"; MouseArea { anchors.fill: parent; onClicked: root.opened = false } }
    Rectangle {
        width: Math.min(576, parent.width - 16)
        height: Math.min(parent.height * 0.9, 760)
        anchors.centerIn: parent
        radius: 16
        color: store.surfaceColor
        border.color: store.borderColor
        clip: true
        Column {
            anchors.fill: parent
            Rectangle {
                width: parent.width; height: 52
                Text { anchors.left: parent.left; anchors.leftMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "电脑端局域网同步中心"; color: store.textColor; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter; text: "✕"; color: store.faintColor }
                MouseArea { anchors.right: parent.right; width: 40; height: parent.height; onClicked: root.opened = false }
            }
            Row {
                x: 16
                spacing: 0
                Rectangle {
                    width: 120; height: 32; radius: 10
                    color: root.tab === "sync" ? store.surfaceColor : "transparent"
                    border.color: store.borderColor
                    Text { anchors.centerIn: parent; text: "局域网同步"; color: root.tab === "sync" ? store.textColor : store.mutedColor; font.pixelSize: 12; font.weight: Font.Medium }
                    MouseArea { anchors.fill: parent; onClicked: root.tab = "sync" }
                }
                Rectangle {
                    width: 120; height: 32; radius: 10
                    color: root.tab === "vault" ? store.surfaceColor : "transparent"
                    border.color: store.borderColor
                    Text { anchors.centerIn: parent; text: "外部存储目录"; color: root.tab === "vault" ? store.textColor : store.mutedColor; font.pixelSize: 12; font.weight: Font.Medium }
                    MouseArea { anchors.fill: parent; onClicked: root.tab = "vault" }
                }
            }
            Flickable {
                width: parent.width
                height: parent.height - 140
                contentHeight: root.tab === "sync" ? syncCol.implicitHeight : vaultCol.implicitHeight
                clip: true
                Column {
                    id: syncCol
                    visible: root.tab === "sync"
                    width: parent.width - 32
                    x: 16
                    spacing: 12
                    Rectangle {
                        width: parent.width; radius: 16; color: store.inputColor; border.color: store.borderColor
                        implicitHeight: syncInfo.implicitHeight + 20
                        Column {
                            id: syncInfo
                            width: parent.width - 24
                            x: 12; y: 10
                            spacing: 8
                            Text { text: "● 电脑端局域网同步服务正常运行中    端口 " + store.syncPort; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                            Row {
                                spacing: 12
                                Image {
                                    width: 144; height: 144
                                    source: store.pairingUrl ? ("image://qr/" + encodeURIComponent(store.pairingUrl)) : ""
                                    cache: false
                                }
                                Column {
                                    width: syncInfo.width - 160
                                    spacing: 6
                                    Text { text: "电脑局域网 IP (点击切换并复制)"; color: store.faintColor; font.pixelSize: 11; font.weight: Font.DemiBold }
                                    Flow {
                                        width: parent.width
                                        spacing: 6
                                        Repeater {
                                            model: store.serverIps
                                            delegate: Rectangle {
                                                required property string modelData
                                                width: ipText.implicitWidth + 16
                                                height: 26
                                                radius: 8
                                                color: modelData === store.selectedIp ? store.primaryColor : store.chipColor
                                                Text { id: ipText; anchors.centerIn: parent; text: modelData; color: modelData === store.selectedIp ? "white" : store.textColor; font.pixelSize: 12; font.family: "Noto Sans Mono CJK SC" }
                                                MouseArea { anchors.fill: parent; onClicked: { store.selectedIp = modelData; store.copySelectedEndpoint() } }
                                            }
                                        }
                                    }
                                    Text { text: "配对安全码 (PIN)：" + store.pin; color: store.primaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                                    Text { text: "修改"; color: store.primaryColor; font.pixelSize: 11; MouseArea { anchors.fill: parent; onClicked: { root.editingPin = true; root.pinDraft = store.pin } } }
                                    Text { width: parent.width; wrapMode: Text.WordWrap; text: "打开手机端「项目便签」，点击右上角互联图标 ->【扫码连接电脑】对准左侧二维码即可秒速同步！"; color: store.mutedColor; font.pixelSize: 11 }
                                }
                            }
                            Row {
                                visible: root.editingPin
                                spacing: 6
                                TextField { width: 90; text: root.pinDraft; onTextChanged: root.pinDraft = text.replace(/\D/g, "").slice(0, 6); font.pixelSize: 12; color: store.textColor }
                                Rectangle { width: 64; height: 28; radius: 8; color: store.primaryColor; Text { anchors.centerIn: parent; text: "保存"; color: "white"; font.pixelSize: 11 }
                                    MouseArea { anchors.fill: parent; onClicked: { if (store.setPin(root.pinDraft)) { root.editingPin = false; root.pinError = "" } else root.pinError = "配对码必须是 6 位数字" } } }
                                Rectangle { width: 64; height: 28; radius: 8; color: store.chipColor; Text { anchors.centerIn: parent; text: "随机"; color: store.secondaryColor; font.pixelSize: 11 }
                                    MouseArea { anchors.fill: parent; onClicked: root.pinDraft = String(Math.floor(100000 + Math.random() * 900000)) } }
                            }
                            Text { visible: root.pinError !== ""; text: root.pinError; color: "#f43f5e"; font.pixelSize: 11 }
                        }
                    }
                    Text { text: "电脑端便签数据概览  " + store.noteCount + " 篇便签 · " + store.projectCount + " 个分类"; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                    Text { width: parent.width; wrapMode: Text.WordWrap; text: store.lastSyncText || "正在等待手机端发起互联同步... (局域网内任意手机扫码即可连接)"; color: store.mutedColor; font.pixelSize: 12 }
                    Text { text: "电脑主动发起互联同步"; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                    Grid {
                        columns: 2
                        spacing: 8
                        Repeater {
                            model: root.modes
                            delegate: Rectangle {
                                required property var modelData
                                width: (syncCol.width - 8) / 2
                                height: 64
                                radius: 12
                                color: root.mode === modelData.id ? store.primarySoft : store.inputColor
                                border.color: root.mode === modelData.id ? store.primaryColor : store.borderColor
                                Column {
                                    anchors.fill: parent
                                    anchors.margins: 8
                                    Text { text: modelData.name + "  " + modelData.badge; color: store.textColor; font.pixelSize: 12; font.weight: Font.Medium }
                                    Text { text: modelData.desc; color: store.mutedColor; font.pixelSize: 10; wrapMode: Text.WordWrap; width: parent.width }
                                }
                                MouseArea { anchors.fill: parent; onClicked: root.mode = modelData.id }
                            }
                        }
                    }
                    Text { text: "已在线的移动端设备"; color: store.faintColor; font.pixelSize: 11; font.weight: Font.DemiBold }
                    Repeater {
                        model: store.connectedDevices
                        delegate: Row {
                            required property var modelData
                            width: syncCol.width
                            spacing: 8
                            Text { text: modelData.deviceName + "  ● 在线"; color: store.secondaryColor; font.pixelSize: 12; width: parent.width - 140 }
                            Rectangle {
                                width: 130; height: 28; radius: 10; color: store.primaryColor
                                Text { anchors.centerIn: parent; text: "向此手机发起同步"; color: "white"; font.pixelSize: 11 }
                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: {
                                        store.triggerSync(modelData.deviceId, root.mode)
                                        root.syncHint = "已向【" + modelData.deviceName + "】发送同步请求，请在手机屏幕上点击【允许】以完成同步..."
                                    }
                                }
                            }
                        }
                    }
                    Text { visible: store.connectedDevices.length === 0; width: parent.width; wrapMode: Text.WordWrap; text: "暂未检测到在线手机。手机端打开「电脑手机互联」后将在此自动就绪。"; color: store.faintColor; font.pixelSize: 12 }
                    Text { text: "或向指定目标设备 IP 发起同步 (多设备/跨网段)"; color: store.faintColor; font.pixelSize: 11 }
                    Row {
                        spacing: 8
                        TextField { width: syncCol.width - 140; placeholderText: "例如：192.168.5.20:25860"; text: root.targetIp; onTextChanged: root.targetIp = text; font.pixelSize: 12; color: store.textColor }
                        TextField { width: 120; placeholderText: "配对码"; text: root.targetPin; onTextChanged: root.targetPin = text; font.pixelSize: 12; color: store.textColor }
                    }
                    Rectangle {
                        width: parent.width; height: 32; radius: 12; color: store.dark ? "#3f3f46" : "#1e293b"
                        Text { anchors.centerIn: parent; text: store.syncBusy ? "正在连接同步中..." : "从电脑向目标 IP 发起同步"; color: "white"; font.pixelSize: 12 }
                        MouseArea { anchors.fill: parent; enabled: !store.syncBusy; onClicked: store.syncTo(root.targetIp, root.targetPin, root.mode) }
                    }
                    Text { visible: root.syncHint !== ""; text: root.syncHint; color: store.primaryColor; font.pixelSize: 12; width: parent.width; wrapMode: Text.WordWrap }
                }
                Column {
                    id: vaultCol
                    visible: root.tab === "vault"
                    width: parent.width - 32
                    x: 16
                    spacing: 12
                    Text { text: "当前外部存储目录"; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                    Text { text: store.vaultEnabled ? "已启用外部镜像" : "未开启"; color: "#059669"; font.pixelSize: 11 }
                    Text { text: store.vaultPath || "未指定外部存储路径"; color: store.textColor; font.pixelSize: 12; font.family: "Noto Sans Mono CJK SC"; width: parent.width; wrapMode: Text.WrapAnywhere }
                    Text { width: parent.width; wrapMode: Text.WordWrap; text: "每篇便签将自动保存为带有元数据的纯净 .md 文件。你可以随时使用 Obsidian、Typora、VS Code 或记事本直接浏览和编辑。"; color: store.mutedColor; font.pixelSize: 12 }
                    Row {
                        spacing: 8
                        Rectangle {
                            width: 180; height: 34; radius: 12; border.color: store.borderColor
                            Text { anchors.centerIn: parent; text: "更换外部存储目录"; color: store.secondaryColor; font.pixelSize: 12 }
                            MouseArea { anchors.fill: parent; onClicked: store.pickVaultFolder() }
                        }
                        Rectangle {
                            width: 200; height: 34; radius: 12; color: store.primaryColor
                            Text { anchors.centerIn: parent; text: "立即全量备份到该目录"; color: "white"; font.pixelSize: 12 }
                            MouseArea { anchors.fill: parent; onClicked: store.exportVault() }
                        }
                    }
                    Text { text: store.vaultMessage; color: store.primaryColor; font.pixelSize: 12; width: parent.width; wrapMode: Text.WordWrap }
                    Row {
                        spacing: 8
                        Text { text: "便签修改时实时写入外部文件夹"; color: store.secondaryColor; font.pixelSize: 12; font.weight: Font.DemiBold }
                        Switch { checked: store.autoExport; onToggled: store.setAutoExport(checked) }
                    }
                }
            }
            Rectangle {
                width: 72; height: 32; radius: 12; color: store.chipColor; x: parent.width - 90
                Text { anchors.centerIn: parent; text: "关闭"; color: store.secondaryColor; font.pixelSize: 12 }
                MouseArea { anchors.fill: parent; onClicked: root.opened = false }
            }
        }
    }
}
