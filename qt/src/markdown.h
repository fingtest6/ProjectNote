#pragma once

#include "models.h"

#include <QString>
#include <QVariantMap>
#include <QVector>

struct DiffLine {
    QString type;
    QString content;
    int oldLineNumber = 0;
    int newLineNumber = 0;
};

struct DiffResult {
    QVector<DiffLine> lines;
    int additions = 0;
    int deletions = 0;
    QVariantMap toMap() const;
};

QString escapeHtml(const QString &text);
QString plainTextSnippet(const QString &markdown, int maxLength = 120);
QVector<QPair<QString, QString>> extractReferences(const QString &content);
QString markdownToHtml(const QString &markdown, const QString &primary, bool dark);

struct ParsedImport {
    QString title;
    QString content;
    QStringList images;
};

ParsedImport parseImportedMarkdown(const QString &filename, const QString &rawContent);
QString noteToMarkdown(const Note &note, const Project *project);
QString sanitizeFilename(const QString &name, int maxLen = 60);

QVariantMap applyLinePrefix(const QString &text, int start, int end, const QString &targetPrefix);
QVariantMap wrapSelection(const QString &text, int start, int end, const QString &tag, const QString &placeholder);
QVariantMap smartEnter(const QString &text, int cursor);
QVariantMap insertIndent(const QString &text, int cursor);

DiffResult computeLineDiff(const QString &oldText, const QString &newText);
