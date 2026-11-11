#pragma once

#include <QAbstractListModel>
#include <QJsonArray>
#include <QJsonObject>
#include <QVariantList>
#include <QVariantMap>
#include <QVector>

struct Project {
    QString id;
    QString name;
    QString color;
    QString icon;
    QString description;
    qint64 createdAt = 0;
    qint64 updatedAt = 0;
    qint64 deletedAt = 0;
    bool isDefault = false;

    QVariantMap toMap() const;
    QJsonObject toJson() const;
    static Project fromJson(const QJsonObject &obj);
};

struct Note {
    QString id;
    QString projectId;
    QString title;
    QString content;
    QStringList images;
    bool pinned = false;
    QStringList tags;
    qint64 createdAt = 0;
    qint64 updatedAt = 0;
    qint64 deletedAt = 0;

    QVariantMap toMap() const;
    QJsonObject toJson() const;
    static Note fromJson(const QJsonObject &obj);
};

struct NoteHistory {
    QString id;
    QString noteId;
    int version = 1;
    QString commitMessage;
    QString title;
    QString content;
    qint64 timestamp = 0;
    int charCount = 0;

    QVariantMap toMap() const;
    QJsonObject toJson() const;
    static NoteHistory fromJson(const QJsonObject &obj);
};

struct SyncStats {
    int pulledNotes = 0;
    int pushedNotes = 0;
    int pulledProjects = 0;
    int pushedProjects = 0;
    int newNotesAdded = 0;
    int historiesSynced = 0;
    QStringList details;

    QVariantMap toMap() const;
};

class VariantListModel : public QAbstractListModel {
    Q_OBJECT
public:
    explicit VariantListModel(QObject *parent = nullptr) : QAbstractListModel(parent) {}

    int rowCount(const QModelIndex &parent = QModelIndex()) const override
    {
        return parent.isValid() ? 0 : m_rows.size();
    }

    QVariant data(const QModelIndex &index, int role) const override
    {
        if (!index.isValid() || index.row() < 0 || index.row() >= m_rows.size())
            return {};
        const QVariantMap map = m_rows.at(index.row()).toMap();
        if (role == Qt::DisplayRole || role == ItemRole)
            return map;
        if (role == NameRole)
            return map.value(QStringLiteral("name"));
        if (role == IdRole)
            return map.value(QStringLiteral("id"));
        if (role == TitleRole)
            return map.value(QStringLiteral("title"));
        if (role == ColorRole)
            return map.value(QStringLiteral("color"));
        return {};
    }

    QHash<int, QByteArray> roleNames() const override
    {
        return {
            {ItemRole, "item"},
            {NameRole, "name"},
            {IdRole, "id"},
            {TitleRole, "title"},
            {ColorRole, "color"},
        };
    }

    Q_INVOKABLE QVariantMap at(int row) const
    {
        if (row < 0 || row >= m_rows.size())
            return {};
        return m_rows.at(row).toMap();
    }

    void reset(const QVariantList &rows)
    {
        beginResetModel();
        m_rows = rows;
        endResetModel();
    }

    int count() const { return m_rows.size(); }

private:
    enum { ItemRole = Qt::UserRole + 1, NameRole, IdRole, TitleRole, ColorRole };
    QVariantList m_rows;
};

QString makeId(const QString &prefix);
qint64 nowMs();
QString jsonStringList(const QStringList &list);
QStringList parseStringList(const QString &json);
