#include "vault.h"

#include "markdown.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QSaveFile>
#include <QStandardPaths>

QString defaultVaultPath()
{
    QString docs = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    if (docs.isEmpty())
        docs = QDir::homePath();
    return docs + QStringLiteral("/ProjectNotesVault");
}

static QString noteFilePath(const VaultConfig &config, const QString &title, const QString &projectName)
{
    const QString projectDir = sanitizeFilename(projectName.isEmpty() ? QStringLiteral("默认项目") : projectName);
    const QString filename = sanitizeFilename(title.isEmpty() ? QStringLiteral("便签") : title) + QStringLiteral(".md");
    return QDir(config.folderPath).filePath(projectDir + QLatin1Char('/') + filename);
}

bool writeNoteFile(const VaultConfig &config, const Note &note, const Project *project)
{
    if (!config.enabled || note.deletedAt > 0 || config.folderPath.trimmed().isEmpty())
        return false;
    const QString path = noteFilePath(config, note.title, project ? project->name : QString());
    QDir().mkpath(QFileInfo(path).absolutePath());
    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;
    file.write(noteToMarkdown(note, project).toUtf8());
    return file.commit();
}

bool deleteNoteFile(const VaultConfig &config, const QString &title, const QString &projectName)
{
    if (!config.enabled || config.folderPath.trimmed().isEmpty())
        return false;
    const QString path = noteFilePath(config, title, projectName);
    if (!QFile::exists(path))
        return false;
    return QFile::remove(path);
}

int exportAllNotes(const VaultConfig &config, const QVector<Project> &projects, const QVector<Note> &notes)
{
    int count = 0;
    for (const Note &note : notes) {
        if (note.deletedAt > 0)
            continue;
        const Project *project = nullptr;
        Project holder;
        for (const Project &candidate : projects) {
            if (candidate.id == note.projectId) {
                holder = candidate;
                project = &holder;
                break;
            }
        }
        if (writeNoteFile(config, note, project))
            ++count;
    }
    return count;
}
