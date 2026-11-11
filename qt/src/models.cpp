#include "models.h"

#include <QDateTime>
#include <QJsonDocument>
#include <QRandomGenerator>

QString makeId(const QString &prefix)
{
    static const char alphabet[] = "0123456789abcdefghijklmnopqrstuvwxyz";
    QString id = prefix;
    for (int i = 0; i < 7; ++i)
        id.append(QLatin1Char(alphabet[QRandomGenerator::global()->bounded(36)]));
    return id;
}

qint64 nowMs()
{
    return QDateTime::currentMSecsSinceEpoch();
}

QString jsonStringList(const QStringList &list)
{
    QJsonArray array;
    for (const QString &item : list)
        array.append(item);
    return QString::fromUtf8(QJsonDocument(array).toJson(QJsonDocument::Compact));
}

QStringList parseStringList(const QString &json)
{
    QStringList out;
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8());
    if (!doc.isArray())
        return out;
    for (const QJsonValue &value : doc.array())
        out.append(value.toString());
    return out;
}

static qint64 jsonInt(const QJsonObject &obj, const char *key)
{
    const QJsonValue value = obj.value(QLatin1String(key));
    if (value.isDouble())
        return static_cast<qint64>(value.toDouble());
    if (value.isString())
        return value.toString().toLongLong();
    return 0;
}

static QStringList jsonStringArray(const QJsonValue &value)
{
    QStringList out;
    if (!value.isArray())
        return out;
    for (const QJsonValue &item : value.toArray())
        out.append(item.toString());
    return out;
}

QVariantMap Project::toMap() const
{
    QVariantMap map;
    map.insert(QStringLiteral("id"), id);
    map.insert(QStringLiteral("name"), name);
    map.insert(QStringLiteral("color"), color);
    map.insert(QStringLiteral("icon"), icon);
    map.insert(QStringLiteral("description"), description);
    map.insert(QStringLiteral("createdAt"), createdAt);
    map.insert(QStringLiteral("updatedAt"), updatedAt);
    map.insert(QStringLiteral("deletedAt"), deletedAt);
    map.insert(QStringLiteral("isDefault"), isDefault);
    return map;
}

QJsonObject Project::toJson() const
{
    QJsonObject obj;
    obj.insert(QStringLiteral("id"), id);
    obj.insert(QStringLiteral("name"), name);
    if (!color.isEmpty())
        obj.insert(QStringLiteral("color"), color);
    if (!icon.isEmpty())
        obj.insert(QStringLiteral("icon"), icon);
    if (!description.isEmpty())
        obj.insert(QStringLiteral("description"), description);
    obj.insert(QStringLiteral("createdAt"), createdAt);
    obj.insert(QStringLiteral("updatedAt"), updatedAt);
    if (deletedAt > 0)
        obj.insert(QStringLiteral("deletedAt"), deletedAt);
    if (isDefault)
        obj.insert(QStringLiteral("isDefault"), true);
    return obj;
}

Project Project::fromJson(const QJsonObject &obj)
{
    Project project;
    project.id = obj.value(QStringLiteral("id")).toString();
    project.name = obj.value(QStringLiteral("name")).toString();
    project.color = obj.value(QStringLiteral("color")).toString();
    project.icon = obj.value(QStringLiteral("icon")).toString();
    project.description = obj.value(QStringLiteral("description")).toString();
    project.createdAt = jsonInt(obj, "createdAt");
    project.updatedAt = jsonInt(obj, "updatedAt");
    project.deletedAt = jsonInt(obj, "deletedAt");
    project.isDefault = obj.value(QStringLiteral("isDefault")).toBool();
    return project;
}

QVariantMap Note::toMap() const
{
    QVariantMap map;
    map.insert(QStringLiteral("id"), id);
    map.insert(QStringLiteral("projectId"), projectId);
    map.insert(QStringLiteral("title"), title);
    map.insert(QStringLiteral("content"), content);
    map.insert(QStringLiteral("images"), images);
    map.insert(QStringLiteral("pinned"), pinned);
    map.insert(QStringLiteral("tags"), tags);
    map.insert(QStringLiteral("createdAt"), createdAt);
    map.insert(QStringLiteral("updatedAt"), updatedAt);
    map.insert(QStringLiteral("deletedAt"), deletedAt);
    return map;
}

QJsonObject Note::toJson() const
{
    QJsonObject obj;
    obj.insert(QStringLiteral("id"), id);
    obj.insert(QStringLiteral("projectId"), projectId);
    obj.insert(QStringLiteral("title"), title);
    obj.insert(QStringLiteral("content"), content);
    QJsonArray imagesJson;
    for (const QString &image : images)
        imagesJson.append(image);
    obj.insert(QStringLiteral("images"), imagesJson);
    obj.insert(QStringLiteral("pinned"), pinned);
    QJsonArray tagsJson;
    for (const QString &tag : tags)
        tagsJson.append(tag);
    obj.insert(QStringLiteral("tags"), tagsJson);
    obj.insert(QStringLiteral("createdAt"), createdAt);
    obj.insert(QStringLiteral("updatedAt"), updatedAt);
    if (deletedAt > 0)
        obj.insert(QStringLiteral("deletedAt"), deletedAt);
    return obj;
}

Note Note::fromJson(const QJsonObject &obj)
{
    Note note;
    note.id = obj.value(QStringLiteral("id")).toString();
    note.projectId = obj.value(QStringLiteral("projectId")).toString();
    note.title = obj.value(QStringLiteral("title")).toString();
    note.content = obj.value(QStringLiteral("content")).toString();
    note.images = jsonStringArray(obj.value(QStringLiteral("images")));
    note.pinned = obj.value(QStringLiteral("pinned")).toBool();
    note.tags = jsonStringArray(obj.value(QStringLiteral("tags")));
    note.createdAt = jsonInt(obj, "createdAt");
    note.updatedAt = jsonInt(obj, "updatedAt");
    note.deletedAt = jsonInt(obj, "deletedAt");
    return note;
}

QVariantMap NoteHistory::toMap() const
{
    QVariantMap map;
    map.insert(QStringLiteral("id"), id);
    map.insert(QStringLiteral("noteId"), noteId);
    map.insert(QStringLiteral("version"), version);
    map.insert(QStringLiteral("commitMessage"), commitMessage);
    map.insert(QStringLiteral("title"), title);
    map.insert(QStringLiteral("content"), content);
    map.insert(QStringLiteral("timestamp"), timestamp);
    map.insert(QStringLiteral("charCount"), charCount);
    return map;
}

QJsonObject NoteHistory::toJson() const
{
    QJsonObject obj;
    obj.insert(QStringLiteral("id"), id);
    obj.insert(QStringLiteral("noteId"), noteId);
    obj.insert(QStringLiteral("version"), version);
    obj.insert(QStringLiteral("commitMessage"), commitMessage);
    obj.insert(QStringLiteral("title"), title);
    obj.insert(QStringLiteral("content"), content);
    obj.insert(QStringLiteral("timestamp"), timestamp);
    obj.insert(QStringLiteral("charCount"), charCount);
    return obj;
}

NoteHistory NoteHistory::fromJson(const QJsonObject &obj)
{
    NoteHistory history;
    history.id = obj.value(QStringLiteral("id")).toString();
    history.noteId = obj.value(QStringLiteral("noteId")).toString();
    history.version = obj.value(QStringLiteral("version")).toInt(1);
    history.commitMessage = obj.value(QStringLiteral("commitMessage")).toString();
    history.title = obj.value(QStringLiteral("title")).toString();
    history.content = obj.value(QStringLiteral("content")).toString();
    history.timestamp = jsonInt(obj, "timestamp");
    history.charCount = obj.value(QStringLiteral("charCount")).toInt();
    return history;
}

QVariantMap SyncStats::toMap() const
{
    QVariantMap map;
    map.insert(QStringLiteral("pulledNotes"), pulledNotes);
    map.insert(QStringLiteral("pushedNotes"), pushedNotes);
    map.insert(QStringLiteral("pulledProjects"), pulledProjects);
    map.insert(QStringLiteral("pushedProjects"), pushedProjects);
    map.insert(QStringLiteral("newNotesAdded"), newNotesAdded);
    map.insert(QStringLiteral("historiesSynced"), historiesSynced);
    map.insert(QStringLiteral("details"), details);
    return map;
}
