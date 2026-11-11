#pragma once

#include "database.h"
#include "models.h"

#include <QElapsedTimer>
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QTcpServer>
#include <QTimer>
#include <functional>
#include <optional>

class QNetworkAccessManager;
class QTcpSocket;

class SyncService : public QObject {
    Q_OBJECT
public:
    explicit SyncService(Repository *repo, QObject *parent = nullptr);

    void setIdentity(const QString &deviceId, const QString &deviceName);
    void setPin(const QString &pin);
    QString pin() const { return m_pin; }
    bool listen(quint16 port = 25860);
    quint16 port() const { return m_port; }

    QStringList localIpv4() const;
    QVariantList connectedDevices() const;
    bool triggerMobile(const QString &deviceId, const QString &mode, int noteCount, int projectCount);

    bool hasIncoming() const { return m_pendingId != 0; }
    QVariantMap incomingSummary() const { return m_incomingSummary; }
    void acceptIncoming();
    void rejectIncoming(const QString &reason);
    SyncStats mergeForTest(const QJsonObject &payload, const QString &mode);

    void syncWithServer(const QString &address, const QString &pin, const QString &mode);
    bool busy() const { return m_busy; }

    bool hasUndo() const { return m_undo.has_value(); }
    bool undo();
    void discardUndo();

    using VaultWriter = std::function<void(const Note &)>;
    using VaultDeleter = std::function<void(const QString &title, const QString &projectName)>;
    void setVaultHooks(VaultWriter writer, VaultDeleter deleter);
    void setRaiseHook(std::function<void()> raise);

signals:
    void incomingChanged();
    void devicesChanged();
    void dataMutated();
    void finished(const QVariantMap &result);
    void pinChanged();

private:
    struct Conn {
        QByteArray buffer;
        bool headersDone = false;
        int contentLength = 0;
        QByteArray body;
        QString method;
        QString target;
        bool responded = false;
        bool holding = false;
        QString deviceId;
        QTimer *timer = nullptr;
    };

    void onNewConnection();
    void onReadyRead(QTcpSocket *socket);
    void handleRequest(QTcpSocket *socket);
    void reply(QTcpSocket *socket, int code, const QByteArray &body, const QByteArray &contentType = "application/json; charset=utf-8");
    void finishIncoming(bool accepted, const QString &reason);
    SyncStats applyIncoming(const QJsonObject &payload, const QString &mode, bool captureUndo);
    QVariantMap resultMap(bool success, bool accepted, const QString &mode, const QString &perspective, const SyncStats &stats, const QString &message) const;
    void mirrorNote(const Note &note);
    void mirrorDelete(const Note &note);
    Project projectFor(const QString &id, const QVector<Project> &extra = {}) const;

    Repository *m_repo = nullptr;
    QTcpServer m_server;
    QHash<QTcpSocket *, Conn> m_conns;
    struct Client {
        QString deviceId;
        QString deviceName;
        qint64 lastSeen = 0;
        QPointer<QTcpSocket> held;
    };
    QHash<QString, Client> m_clients;
    QHash<QString, QJsonObject> m_tasks;
    QHash<QString, QPair<QString, qint64>> m_invites;
    QString m_pin = QStringLiteral("888888");
    QString m_deviceId;
    QString m_deviceName;
    quint16 m_port = 25860;
    int m_pendingId = 0;
    QPointer<QTcpSocket> m_pendingSocket;
    QJsonObject m_pendingPayload;
    QString m_pendingMode;
    QVariantMap m_incomingSummary;
    QTimer m_pendingTimer;
    QNetworkAccessManager *m_nam = nullptr;
    bool m_busy = false;
    std::optional<Repository::Snapshot> m_undo;
    VaultWriter m_writeVault;
    VaultDeleter m_deleteVault;
    std::function<void()> m_raise;
    QVariantMap m_lastServerSync;
};
