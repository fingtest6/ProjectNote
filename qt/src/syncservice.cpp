#include "syncservice.h"

#include <algorithm>

#include <QHostAddress>
#include <QSet>
#include <QHostInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkAccessManager>
#include <QNetworkInterface>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTcpSocket>
#include <QUrl>
#include <QUrlQuery>

namespace {
constexpr int kInviteTtlMs = 2 * 60 * 1000;
constexpr int kConfirmTimeoutMs = 45000;

QVector<Project> projectsFromPayload(const QJsonObject &payload)
{
    QVector<Project> rows;
    for (const QJsonValue &value : payload.value(QStringLiteral("projects")).toArray())
        rows.append(Project::fromJson(value.toObject()));
    return rows;
}

QVector<Note> notesFromPayload(const QJsonObject &payload)
{
    QVector<Note> rows;
    for (const QJsonValue &value : payload.value(QStringLiteral("notes")).toArray())
        rows.append(Note::fromJson(value.toObject()));
    return rows;
}

QVector<NoteHistory> historiesFromPayload(const QJsonObject &payload)
{
    QVector<NoteHistory> rows;
    for (const QJsonValue &value : payload.value(QStringLiteral("histories")).toArray())
        rows.append(NoteHistory::fromJson(value.toObject()));
    return rows;
}

int liveNotes(const QVector<Note> &notes)
{
    int count = 0;
    for (const Note &note : notes)
        if (note.deletedAt <= 0)
            ++count;
    return count;
}

int liveProjects(const QVector<Project> &projects)
{
    int count = 0;
    for (const Project &project : projects)
        if (project.deletedAt <= 0)
            ++count;
    return count;
}

QString normalizeServerUrl(QString address)
{
    address = address.trimmed();
    if (!address.startsWith(QLatin1String("http://")) && !address.startsWith(QLatin1String("https://")))
        address.prepend(QStringLiteral("http://"));
    QUrl url(address);
    if (url.port() < 0)
        url.setPort(25860);
    return url.toString(QUrl::RemovePath | QUrl::RemoveQuery);
}
}

SyncService::SyncService(Repository *repo, QObject *parent)
    : QObject(parent)
    , m_repo(repo)
{
    connect(&m_server, &QTcpServer::newConnection, this, &SyncService::onNewConnection);
    m_pendingTimer.setSingleShot(true);
    connect(&m_pendingTimer, &QTimer::timeout, this, [this] {
        finishIncoming(false, QStringLiteral("电脑端未在 45 秒内点击确认允许同步"));
    });
    m_nam = new QNetworkAccessManager(this);
}

void SyncService::setIdentity(const QString &deviceId, const QString &deviceName)
{
    m_deviceId = deviceId;
    m_deviceName = deviceName;
}

void SyncService::setPin(const QString &pin)
{
    if (m_pin == pin)
        return;
    m_pin = pin;
    emit pinChanged();
}

void SyncService::setVaultHooks(VaultWriter writer, VaultDeleter deleter)
{
    m_writeVault = std::move(writer);
    m_deleteVault = std::move(deleter);
}

void SyncService::setRaiseHook(std::function<void()> raise)
{
    m_raise = std::move(raise);
}

bool SyncService::listen(quint16 port)
{
    m_port = port;
    if (m_server.isListening())
        return true;
    if (!m_server.listen(QHostAddress::Any, port)) {
        qWarning() << "LAN sync listen failed:" << m_server.errorString();
        return false;
    }
    return true;
}

QStringList SyncService::localIpv4() const
{
    struct Item { QString address; int score; };
    QList<Item> items;
    const auto interfaces = QNetworkInterface::allInterfaces();
    for (const QNetworkInterface &iface : interfaces) {
        const QString name = iface.humanReadableName().toLower();
        const bool virtualIf = name.contains(QLatin1String("wsl")) || name.contains(QLatin1String("vethernet"))
            || name.contains(QLatin1String("virtual")) || name.contains(QLatin1String("vmware"))
            || name.contains(QLatin1String("docker")) || name.contains(QLatin1String("br-"))
            || name.contains(QLatin1String("virbr"));
        for (const QNetworkAddressEntry &entry : iface.addressEntries()) {
            const QHostAddress address = entry.ip();
            if (address.protocol() != QAbstractSocket::IPv4Protocol || address.isLoopback())
                continue;
            const QString text = address.toString();
            int score = virtualIf ? 1 : 5;
            if (text.startsWith(QLatin1String("192.168.")))
                score = 10;
            else if (text.startsWith(QLatin1String("10.")))
                score = 8;
            items.append({text, score});
        }
    }
    std::sort(items.begin(), items.end(), [](const Item &a, const Item &b) { return a.score > b.score; });
    QStringList list;
    for (const Item &item : items) {
        if (!list.contains(item.address))
            list.append(item.address);
    }
    if (list.isEmpty())
        list.append(QStringLiteral("127.0.0.1"));
    return list;
}

QVariantList SyncService::connectedDevices() const
{
    const qint64 now = nowMs();
    QVariantList list;
    for (auto it = m_clients.cbegin(); it != m_clients.cend(); ++it) {
        if (now - it->lastSeen < 60000) {
            list.append(QVariantMap{
                {QStringLiteral("deviceId"), it->deviceId},
                {QStringLiteral("deviceName"), it->deviceName},
            });
        }
    }
    return list;
}

bool SyncService::triggerMobile(const QString &deviceId, const QString &mode, int noteCount, int projectCount)
{
    QJsonObject task;
    task.insert(QStringLiteral("type"), QStringLiteral("sync-invitation"));
    task.insert(QStringLiteral("mode"), mode.isEmpty() ? QStringLiteral("smart-merge") : mode);
    task.insert(QStringLiteral("from"), m_deviceName);
    task.insert(QStringLiteral("noteCount"), noteCount);
    task.insert(QStringLiteral("projectCount"), projectCount);
    task.insert(QStringLiteral("timestamp"), nowMs());

    auto send = [&](const QString &id, Client &client) {
        m_invites.insert(id, {task.value(QStringLiteral("mode")).toString(), nowMs() + kInviteTtlMs});
        if (client.held && client.held->state() == QAbstractSocket::ConnectedState) {
            QJsonObject body;
            body.insert(QStringLiteral("hasTask"), true);
            body.insert(QStringLiteral("task"), task);
            reply(client.held, 200, QJsonDocument(body).toJson(QJsonDocument::Compact));
            client.held.clear();
            return true;
        }
        m_tasks.insert(id, task);
        return true;
    };

    if (!deviceId.isEmpty()) {
        Client client = m_clients.value(deviceId);
        client.deviceId = deviceId;
        const bool ok = send(deviceId, client);
        m_clients.insert(deviceId, client);
        return ok;
    }
    bool sent = false;
    const auto ids = m_clients.keys();
    for (const QString &id : ids) {
        Client client = m_clients.value(id);
        if (client.held) {
            send(id, client);
            m_clients.insert(id, client);
            sent = true;
        }
    }
    return sent;
}

void SyncService::onNewConnection()
{
    while (m_server.hasPendingConnections()) {
        QTcpSocket *socket = m_server.nextPendingConnection();
        m_conns.insert(socket, {});
        connect(socket, &QTcpSocket::readyRead, this, [this, socket] { onReadyRead(socket); });
        connect(socket, &QTcpSocket::disconnected, this, [this, socket] {
            Conn conn = m_conns.take(socket);
            if (conn.timer)
                conn.timer->deleteLater();
            if (!conn.deviceId.isEmpty()) {
                Client client = m_clients.value(conn.deviceId);
                if (client.held == socket)
                    client.held.clear();
                m_clients.insert(conn.deviceId, client);
            }
            if (m_pendingSocket == socket)
                finishIncoming(false, QStringLiteral("连接已断开"));
            socket->deleteLater();
            emit devicesChanged();
        });
    }
}

void SyncService::onReadyRead(QTcpSocket *socket)
{
    if (!m_conns.contains(socket))
        return;
    Conn &conn = m_conns[socket];
    conn.buffer += socket->readAll();
    if (!conn.headersDone) {
        const int split = conn.buffer.indexOf("\r\n\r\n");
        if (split < 0)
            return;
        const QByteArray headerBytes = conn.buffer.left(split);
        conn.body = conn.buffer.mid(split + 4);
        conn.buffer.clear();
        const QList<QByteArray> lines = headerBytes.split('\n');
        if (lines.isEmpty())
            return;
        const QList<QByteArray> parts = lines.first().trimmed().split(' ');
        if (parts.size() >= 2) {
            conn.method = QString::fromLatin1(parts.at(0));
            conn.target = QString::fromLatin1(parts.at(1));
        }
        for (const QByteArray &line : lines) {
            if (line.toLower().startsWith("content-length:"))
                conn.contentLength = line.mid(line.indexOf(':') + 1).trimmed().toInt();
        }
        conn.headersDone = true;
    } else {
        conn.body += conn.buffer;
        conn.buffer.clear();
    }
    if (conn.contentLength > 80 * 1024 * 1024) {
        reply(socket, 413, "{\"success\":false,\"message\":\"payload too large\"}");
        return;
    }
    if (conn.body.size() < conn.contentLength)
        return;
    handleRequest(socket);
}

void SyncService::reply(QTcpSocket *socket, int code, const QByteArray &body, const QByteArray &contentType)
{
    if (!socket || !m_conns.contains(socket) || m_conns[socket].responded)
        return;
    Conn &conn = m_conns[socket];
    conn.responded = true;
    conn.holding = false;
    if (conn.timer) {
        conn.timer->stop();
        conn.timer->deleteLater();
        conn.timer = nullptr;
    }
    QByteArray status = "OK";
    if (code == 403) status = "Forbidden";
    else if (code == 404) status = "Not Found";
    else if (code == 204) status = "No Content";
    else if (code == 500) status = "Error";
    else if (code == 413) status = "Payload Too Large";
    QByteArray message;
    message += "HTTP/1.1 " + QByteArray::number(code) + " " + status + "\r\n";
    message += "Access-Control-Allow-Origin: *\r\n";
    message += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
    message += "Access-Control-Allow-Headers: Content-Type\r\n";
    message += "Content-Type: " + contentType + "\r\n";
    message += "Content-Length: " + QByteArray::number(body.size()) + "\r\n";
    message += "Connection: close\r\n\r\n";
    message += body;
    socket->write(message);
    socket->disconnectFromHost();
}

void SyncService::handleRequest(QTcpSocket *socket)
{
    Conn &conn = m_conns[socket];
    if (conn.method == QLatin1String("OPTIONS")) {
        reply(socket, 204, QByteArray());
        return;
    }
    const QUrl url(QStringLiteral("http://localhost") + conn.target);
    const QString path = url.path();
    const QUrlQuery query(url);

    if (path == QLatin1String("/api/status") && conn.method == QLatin1String("GET")) {
        const QString deviceId = query.queryItemValue(QStringLiteral("deviceId"));
        const QString deviceName = QUrl::fromPercentEncoding(query.queryItemValue(QStringLiteral("deviceName"), QUrl::FullyDecoded).toUtf8());
        if (!deviceId.isEmpty()) {
            Client client = m_clients.value(deviceId);
            client.deviceId = deviceId;
            client.deviceName = deviceName.isEmpty() ? (client.deviceName.isEmpty() ? QStringLiteral("移动设备") : client.deviceName) : deviceName;
            client.lastSeen = nowMs();
            m_clients.insert(deviceId, client);
            emit devicesChanged();
        }
        QJsonObject body;
        body.insert(QStringLiteral("status"), QStringLiteral("ready"));
        body.insert(QStringLiteral("deviceName"), m_deviceName);
        QJsonArray ips;
        for (const QString &ip : localIpv4())
            ips.append(ip);
        body.insert(QStringLiteral("ips"), ips);
        body.insert(QStringLiteral("port"), m_port);
        body.insert(QStringLiteral("pinRequired"), true);
        body.insert(QStringLiteral("noteCount"), m_repo->liveNoteCount());
        body.insert(QStringLiteral("projectCount"), m_repo->liveProjectCount());
        reply(socket, 200, QJsonDocument(body).toJson(QJsonDocument::Compact));
        return;
    }

    if (path == QLatin1String("/api/device/poll") && conn.method == QLatin1String("GET")) {
        const QString deviceId = query.queryItemValue(QStringLiteral("deviceId"));
        const QString deviceName = QUrl::fromPercentEncoding(query.queryItemValue(QStringLiteral("deviceName"), QUrl::FullyDecoded).toUtf8());
        const QString id = deviceId.isEmpty() ? QStringLiteral("unknown") : deviceId;
        if (m_tasks.contains(id)) {
            QJsonObject body;
            body.insert(QStringLiteral("hasTask"), true);
            body.insert(QStringLiteral("task"), m_tasks.take(id));
            reply(socket, 200, QJsonDocument(body).toJson(QJsonDocument::Compact));
            return;
        }
        Client client = m_clients.value(id);
        client.deviceId = id;
        client.deviceName = deviceName.isEmpty() ? QStringLiteral("移动设备") : deviceName;
        client.lastSeen = nowMs();
        client.held = socket;
        m_clients.insert(id, client);
        conn.holding = true;
        conn.deviceId = id;
        conn.timer = new QTimer(this);
        conn.timer->setSingleShot(true);
        connect(conn.timer, &QTimer::timeout, this, [this, socket] {
            if (!m_conns.contains(socket) || m_conns[socket].responded)
                return;
            reply(socket, 200, "{\"hasTask\":false}");
        });
        conn.timer->start(20000);
        emit devicesChanged();
        return;
    }

    if (path == QLatin1String("/api/device/list") && conn.method == QLatin1String("GET")) {
        QJsonArray devices;
        const qint64 now = nowMs();
        for (const Client &client : m_clients) {
            if (now - client.lastSeen < 60000) {
                QJsonObject item;
                item.insert(QStringLiteral("deviceId"), client.deviceId);
                item.insert(QStringLiteral("deviceName"), client.deviceName);
                devices.append(item);
            }
        }
        QJsonObject body;
        body.insert(QStringLiteral("devices"), devices);
        reply(socket, 200, QJsonDocument(body).toJson(QJsonDocument::Compact));
        return;
    }

    if (path == QLatin1String("/api/sync") && conn.method == QLatin1String("POST")) {
        const QJsonDocument doc = QJsonDocument::fromJson(conn.body);
        const QJsonObject parsed = doc.object();
        if (parsed.value(QStringLiteral("pin")).toString() != m_pin) {
            reply(socket, 403, "{\"success\":false,\"message\":\"配对码错误，请核对电脑端显示的 6 位配对码！\"}");
            return;
        }
        const QJsonObject from = parsed.value(QStringLiteral("from")).toObject();
        const QJsonObject payload = parsed.value(QStringLiteral("payload")).toObject();
        const QString fromId = from.value(QStringLiteral("deviceId")).toString(payload.value(QStringLiteral("deviceId")).toString(QStringLiteral("unknown")));
        const QString mode = parsed.value(QStringLiteral("mode")).toString(QStringLiteral("smart-merge"));
        const auto invite = m_invites.value(fromId);
        const bool replyToInvite = from.value(QStringLiteral("isReplyToInvite")).toBool() && !invite.first.isEmpty() && invite.second > nowMs();
        if (replyToInvite)
            m_invites.remove(fromId);

        m_pendingId += 1;
        m_pendingSocket = socket;
        m_pendingPayload = payload;
        m_pendingMode = mode;
        const QVector<Note> remoteNotes = notesFromPayload(payload);
        const QVector<Project> remoteProjects = projectsFromPayload(payload);
        const QJsonObject summary = parsed.value(QStringLiteral("summary")).toObject();
        m_incomingSummary = QVariantMap{
            {QStringLiteral("id"), m_pendingId},
            {QStringLiteral("deviceId"), fromId},
            {QStringLiteral("deviceName"), from.value(QStringLiteral("deviceName")).toString(payload.value(QStringLiteral("deviceName")).toString(QStringLiteral("移动端设备")))},
            {QStringLiteral("isReplyToInvite"), replyToInvite},
            {QStringLiteral("mode"), mode},
            {QStringLiteral("noteCount"), summary.contains(QStringLiteral("noteCount")) ? summary.value(QStringLiteral("noteCount")).toInt() : liveNotes(remoteNotes)},
            {QStringLiteral("projectCount"), summary.contains(QStringLiteral("projectCount")) ? summary.value(QStringLiteral("projectCount")).toInt() : liveProjects(remoteProjects)},
        };
        if (m_raise)
            m_raise();
        if (replyToInvite) {
            acceptIncoming();
            return;
        }
        m_pendingTimer.start(kConfirmTimeoutMs);
        emit incomingChanged();
        return;
    }

    reply(socket, 404, "Not found", "text/plain; charset=utf-8");
}

Project SyncService::projectFor(const QString &id, const QVector<Project> &extra) const
{
    for (const Project &project : extra) {
        if (project.id == id)
            return project;
    }
    return m_repo->projectById(id);
}

void SyncService::mirrorNote(const Note &note)
{
    if (!m_writeVault)
        return;
    m_writeVault(note);
}

void SyncService::mirrorDelete(const Note &note)
{
    if (!m_deleteVault)
        return;
    const Project project = m_repo->projectById(note.projectId);
    m_deleteVault(note.title, project.name.isEmpty() ? QStringLiteral("默认项目") : project.name);
}

SyncStats SyncService::applyIncoming(const QJsonObject &payload, const QString &mode, bool captureUndo)
{
    SyncStats stats;
    if (captureUndo && mode != QLatin1String("pull-overwrite"))
        m_undo = m_repo->capture();

    const QVector<Project> remoteProjects = projectsFromPayload(payload);
    const QVector<Note> remoteNotes = notesFromPayload(payload);
    const QVector<NoteHistory> remoteHistories = historiesFromPayload(payload);

    if (mode == QLatin1String("push-overwrite")) {
        m_repo->replaceAll(remoteProjects, remoteNotes, remoteHistories);
        stats.pulledProjects = remoteProjects.size();
        stats.pulledNotes = remoteNotes.size();
        stats.newNotesAdded = remoteNotes.size();
        stats.historiesSynced = remoteHistories.size();
        for (const Note &note : remoteNotes) {
            if (note.deletedAt > 0)
                mirrorDelete(note);
            else
                mirrorNote(note);
        }
        stats.details.append(QStringLiteral("已按对方版本完全覆盖本机：写入 %1 篇便签、%2 个分类").arg(remoteNotes.size()).arg(remoteProjects.size()));
        return stats;
    }

    if (mode == QLatin1String("pull-overwrite")) {
        const int current = m_repo->liveNoteCount();
        stats.pushedNotes = current;
        stats.details.append(QStringLiteral("对方请求全量拉取：本机保持不变，已向对方传输全部 %1 篇便签").arg(current));
        return stats;
    }

    const QVector<Project> localProjects = m_repo->projects(true);
    const QVector<Note> localNotes = m_repo->notes(true);
    const QVector<NoteHistory> localHistories = m_repo->allHistories();
    QHash<QString, Project> localProjectMap;
    QHash<QString, Note> localNoteMap;
    QSet<QString> localHistoryIds;
    for (const Project &project : localProjects)
        localProjectMap.insert(project.id, project);
    for (const Note &note : localNotes)
        localNoteMap.insert(note.id, note);
    for (const NoteHistory &history : localHistories)
        localHistoryIds.insert(history.id);

    for (const Project &remoteProject : remoteProjects) {
        if (remoteProject.deletedAt > 0)
            continue;
        if (!localProjectMap.contains(remoteProject.id)) {
            m_repo->upsertProject(remoteProject);
            ++stats.pulledProjects;
            stats.details.append(QStringLiteral("[拉取项目] 新增项目分类「%1」").arg(remoteProject.name));
            continue;
        }
        if (mode == QLatin1String("new-only"))
            continue;
        const Project localProject = localProjectMap.value(remoteProject.id);
        if (localProject.deletedAt > 0) {
            m_repo->upsertProject(remoteProject);
            ++stats.pulledProjects;
            stats.details.append(QStringLiteral("[恢复删除] 项目分类「%1」已按对方仍保留的副本恢复").arg(remoteProject.name));
            continue;
        }
        if (remoteProject.updatedAt > localProject.updatedAt) {
            m_repo->upsertProject(remoteProject);
            ++stats.pulledProjects;
            stats.details.append(QStringLiteral("[更新项目] 项目「%1」已更新为远端最新设置").arg(remoteProject.name));
        } else if (localProject.updatedAt > remoteProject.updatedAt) {
            ++stats.pushedProjects;
        }
    }

    QSet<QString> remoteProjectIds;
    for (const Project &project : remoteProjects)
        remoteProjectIds.insert(project.id);
    for (const Project &localProject : localProjects) {
        if (remoteProjectIds.contains(localProject.id) || localProject.deletedAt > 0)
            continue;
        ++stats.pushedProjects;
        stats.details.append(QStringLiteral("[推送项目] 本地新项目「%1」已推送至对方").arg(localProject.name));
    }

    for (const Note &remoteNote : remoteNotes) {
        if (remoteNote.deletedAt > 0)
            continue;
        if (!localNoteMap.contains(remoteNote.id)) {
            m_repo->upsertNote(remoteNote);
            ++stats.pulledNotes;
            ++stats.newNotesAdded;
            stats.details.append(QStringLiteral("[拉取新增] 便签「%1」").arg(remoteNote.title.isEmpty() ? QStringLiteral("无标题") : remoteNote.title));
            mirrorNote(remoteNote);
            continue;
        }
        if (mode == QLatin1String("new-only"))
            continue;
        const Note localNote = localNoteMap.value(remoteNote.id);
        if (localNote.deletedAt > 0) {
            m_repo->upsertNote(remoteNote);
            ++stats.pulledNotes;
            stats.details.append(QStringLiteral("[恢复删除] 便签「%1」已按对方仍保留的副本恢复").arg(remoteNote.title.isEmpty() ? QStringLiteral("无标题") : remoteNote.title));
            mirrorNote(remoteNote);
            continue;
        }
        if (remoteNote.updatedAt > localNote.updatedAt) {
            m_repo->upsertNote(remoteNote);
            ++stats.pulledNotes;
            stats.details.append(QStringLiteral("[拉取更新] 便签「%1」(对方版本更新)").arg(remoteNote.title));
            mirrorNote(remoteNote);
        } else if (localNote.updatedAt > remoteNote.updatedAt) {
            ++stats.pushedNotes;
            stats.details.append(QStringLiteral("[推送更新] 便签「%1」(本机版本更新)").arg(localNote.title));
        }
    }

    QSet<QString> remoteNoteIds;
    for (const Note &note : remoteNotes)
        remoteNoteIds.insert(note.id);
    for (const Note &localNote : localNotes) {
        if (remoteNoteIds.contains(localNote.id) || localNote.deletedAt > 0)
            continue;
        ++stats.pushedNotes;
        stats.details.append(QStringLiteral("[推送新增] 本地新建便签「%1」已推送到对方").arg(localNote.title.isEmpty() ? QStringLiteral("无标题") : localNote.title));
    }

    for (const NoteHistory &history : remoteHistories) {
        if (localHistoryIds.contains(history.id))
            continue;
        m_repo->addHistory(history);
        ++stats.historiesSynced;
    }
    return stats;
}

SyncStats SyncService::mergeForTest(const QJsonObject &payload, const QString &mode)
{
    return applyIncoming(payload, mode, true);
}

void SyncService::acceptIncoming()
{
    if (!m_pendingSocket)
        return;
    m_pendingTimer.stop();
    const SyncStats stats = applyIncoming(m_pendingPayload, m_pendingMode, true);
    QJsonObject payload = m_repo->syncPayload(m_deviceId, m_deviceName);
    QJsonObject statsJson;
    statsJson.insert(QStringLiteral("pulledNotes"), stats.pulledNotes);
    statsJson.insert(QStringLiteral("pushedNotes"), stats.pushedNotes);
    statsJson.insert(QStringLiteral("pulledProjects"), stats.pulledProjects);
    statsJson.insert(QStringLiteral("pushedProjects"), stats.pushedProjects);
    statsJson.insert(QStringLiteral("newNotesAdded"), stats.newNotesAdded);
    statsJson.insert(QStringLiteral("historiesSynced"), stats.historiesSynced);
    QJsonArray details;
    for (const QString &detail : stats.details)
        details.append(detail);
    statsJson.insert(QStringLiteral("details"), details);
    payload.insert(QStringLiteral("stats"), statsJson);
    QJsonObject body;
    body.insert(QStringLiteral("success"), true);
    body.insert(QStringLiteral("accepted"), true);
    body.insert(QStringLiteral("payload"), payload);
    body.insert(QStringLiteral("stats"), statsJson);
    reply(m_pendingSocket, 200, QJsonDocument(body).toJson(QJsonDocument::Compact));
    m_lastServerSync = QVariantMap{
        {QStringLiteral("timestamp"), nowMs()},
        {QStringLiteral("deviceName"), m_incomingSummary.value(QStringLiteral("deviceName"))},
        {QStringLiteral("mode"), m_pendingMode},
    };
    m_pendingSocket.clear();
    m_pendingPayload = {};
    m_incomingSummary.clear();
    emit incomingChanged();
    emit dataMutated();
    emit finished(resultMap(true, true, m_pendingMode, QStringLiteral("receiver"), stats,
                            QStringLiteral("已成功完成与【%1】的互联同步！").arg(m_lastServerSync.value(QStringLiteral("deviceName")).toString())));
}

void SyncService::rejectIncoming(const QString &reason)
{
    finishIncoming(false, reason.isEmpty() ? QStringLiteral("本端用户拒绝了同步请求") : reason);
}

void SyncService::finishIncoming(bool accepted, const QString &reason)
{
    m_pendingTimer.stop();
    if (m_pendingSocket) {
        QJsonObject body;
        body.insert(QStringLiteral("success"), false);
        body.insert(QStringLiteral("accepted"), accepted);
        body.insert(QStringLiteral("message"), reason);
        reply(m_pendingSocket, 200, QJsonDocument(body).toJson(QJsonDocument::Compact));
    }
    m_pendingSocket.clear();
    m_pendingPayload = {};
    m_incomingSummary.clear();
    emit incomingChanged();
}

QVariantMap SyncService::resultMap(bool success, bool accepted, const QString &mode, const QString &perspective, const SyncStats &stats, const QString &message) const
{
    QVariantMap map = stats.toMap();
    map.insert(QStringLiteral("success"), success);
    map.insert(QStringLiteral("accepted"), accepted);
    map.insert(QStringLiteral("mode"), mode);
    map.insert(QStringLiteral("perspective"), perspective);
    map.insert(QStringLiteral("message"), message);
    return map;
}

void SyncService::syncWithServer(const QString &address, const QString &pin, const QString &mode)
{
    if (m_busy)
        return;
    m_busy = true;
    const QString base = normalizeServerUrl(address);
    QJsonObject local = m_repo->syncPayload(m_deviceId, m_deviceName);
    QJsonObject from;
    from.insert(QStringLiteral("deviceId"), m_deviceId);
    from.insert(QStringLiteral("deviceName"), m_deviceName);
    from.insert(QStringLiteral("isReplyToInvite"), false);
    QJsonObject summary;
    summary.insert(QStringLiteral("noteCount"), m_repo->liveNoteCount());
    summary.insert(QStringLiteral("projectCount"), m_repo->liveProjectCount());
    QJsonObject body;
    body.insert(QStringLiteral("pin"), pin);
    body.insert(QStringLiteral("mode"), mode);
    body.insert(QStringLiteral("from"), from);
    body.insert(QStringLiteral("summary"), summary);
    body.insert(QStringLiteral("payload"), local);
    QNetworkRequest request(QUrl(base + QStringLiteral("/api/sync")));
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    request.setTransferTimeout(50000);
    QNetworkReply *reply = m_nam->post(request, QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply, mode] {
        m_busy = false;
        const QByteArray raw = reply->readAll();
        const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto error = reply->error();
        reply->deleteLater();
        if (error != QNetworkReply::NoError && status == 0) {
            QString reason = reply->errorString();
            if (error == QNetworkReply::TimeoutError || error == QNetworkReply::OperationCanceledError)
                reason = QStringLiteral("连接超时：对方设备未在 50 秒内点击确认允许，或网络未联通");
            else
                reason = QStringLiteral("无法连接到对方设备：请确认设备处于同一 Wi-Fi 且局域网互联服务已开启");
            emit finished(resultMap(false, false, mode, QStringLiteral("initiator"), {}, reason));
            return;
        }
        const QJsonObject data = QJsonDocument::fromJson(raw).object();
        if (status == 403 || data.value(QStringLiteral("accepted")).toBool() == false || !data.value(QStringLiteral("success")).toBool()) {
            emit finished(resultMap(false, false, mode, QStringLiteral("initiator"), {},
                                    data.value(QStringLiteral("message")).toString(QStringLiteral("对方设备拒绝了本次同步请求"))));
            return;
        }
        const QJsonObject remote = data.value(QStringLiteral("payload")).toObject();
        if (remote.isEmpty()) {
            emit finished(resultMap(false, false, mode, QStringLiteral("initiator"), {}, QStringLiteral("远程设备拒绝或未能完成同步")));
            return;
        }
        SyncStats stats;
        if (mode == QLatin1String("push-overwrite")) {
            discardUndo();
            const int live = m_repo->liveNoteCount();
            stats.pushedNotes = live;
            stats.pushedProjects = m_repo->liveProjectCount();
            stats.details.append(QStringLiteral("【完全推送成功】已将本机 %1 篇便签完全覆盖写入对方设备！").arg(live));
        } else {
            stats = applyIncoming(remote, mode, true);
        }
        const QString label = mode == QLatin1String("smart-merge") ? QStringLiteral("双向智能合并")
            : mode == QLatin1String("push-overwrite") ? QStringLiteral("完全覆盖对方")
            : mode == QLatin1String("pull-overwrite") ? QStringLiteral("完全覆盖本机")
            : mode == QLatin1String("new-only") ? QStringLiteral("仅同步新增便签")
            : QStringLiteral("互联同步");
        emit dataMutated();
        emit finished(resultMap(true, true, mode, QStringLiteral("initiator"), stats,
                                QStringLiteral("【%1】同步完成！从对方拉取更新 %2 篇，向对方推送更新 %3 篇，新增便签 %4 篇")
                                    .arg(label)
                                    .arg(stats.pulledNotes)
                                    .arg(stats.pushedNotes)
                                    .arg(stats.newNotesAdded)));
    });
}

bool SyncService::undo()
{
    if (!m_undo)
        return false;
    m_repo->restore(*m_undo);
    m_undo.reset();
    emit dataMutated();
    return true;
}

void SyncService::discardUndo()
{
    m_undo.reset();
}
