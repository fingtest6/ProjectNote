#pragma once

#include "models.h"

struct VaultConfig {
    bool enabled = true;
    QString folderPath;
    bool autoExportOnSave = true;
};

QString defaultVaultPath();
bool writeNoteFile(const VaultConfig &config, const Note &note, const Project *project);
bool deleteNoteFile(const VaultConfig &config, const QString &title, const QString &projectName);
int exportAllNotes(const VaultConfig &config, const QVector<Project> &projects, const QVector<Note> &notes);
