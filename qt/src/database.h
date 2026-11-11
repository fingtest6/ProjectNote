#pragma once

#include "models.h"

#include <QSqlDatabase>
#include <QString>

class Repository {
public:
    Repository() = default;
    ~Repository();

    bool open(const QString &filePath);
    QString filePath() const { return m_path; }

    void seedIfEmpty();
    void purgeExpiredTombstoneHistories();

    QVector<Project> projects(bool includeDeleted) const;
    QVector<Note> notes(bool includeDeleted) const;
    QVector<NoteHistory> histories(const QString &noteId) const;
    QVector<NoteHistory> allHistories() const;

    Project projectById(const QString &id) const;
    Note noteById(const QString &id) const;
    bool hasProject(const QString &id) const;
    bool hasNote(const QString &id) const;

    void upsertProject(const Project &project);
    void upsertNote(const Note &note);
    void addHistory(const NoteHistory &history);
    void deleteHistories(const QStringList &ids);
    void deleteHistoriesForNote(const QString &noteId);
    void clearAll();

    int liveProjectCount() const;
    int liveNoteCount() const;

    QJsonObject syncPayload(const QString &deviceId, const QString &deviceName) const;
    void replaceAll(const QVector<Project> &projects, const QVector<Note> &notes, const QVector<NoteHistory> &histories);

    struct Snapshot {
        QVector<Project> projects;
        QVector<Note> notes;
        QVector<NoteHistory> histories;
    };
    Snapshot capture() const;
    void restore(const Snapshot &snapshot);

private:
    bool exec(const QString &sql);
    Project projectFromQuery(class QSqlQuery &query) const;
    Note noteFromQuery(class QSqlQuery &query) const;
    NoteHistory historyFromQuery(class QSqlQuery &query) const;

    QSqlDatabase m_db;
    QString m_connection;
    QString m_path;
};
