#include "markdown.h"

#include <algorithm>
#include <QVariantList>

DiffResult computeLineDiff(const QString &oldText, const QString &newText)
{
    const QStringList oldLines = oldText.isEmpty() ? QStringList() : oldText.split(QLatin1Char('\n'));
    const QStringList newLines = newText.isEmpty() ? QStringList() : newText.split(QLatin1Char('\n'));
    const int m = oldLines.size();
    const int n = newLines.size();

    QVector<QVector<int>> dp(m + 1, QVector<int>(n + 1, 0));
    for (int i = 0; i < m; ++i) {
        for (int j = 0; j < n; ++j) {
            if (oldLines.at(i) == newLines.at(j))
                dp[i + 1][j + 1] = dp[i][j] + 1;
            else
                dp[i + 1][j + 1] = std::max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    QVector<DiffLine> reversed;
    int additions = 0;
    int deletions = 0;
    int i = m;
    int j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines.at(i - 1) == newLines.at(j - 1)) {
            DiffLine line;
            line.type = QStringLiteral("unchanged");
            line.content = oldLines.at(i - 1);
            line.oldLineNumber = i;
            line.newLineNumber = j;
            reversed.append(line);
            --i;
            --j;
        } else if (j > 0 && (i == 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            DiffLine line;
            line.type = QStringLiteral("added");
            line.content = newLines.at(j - 1);
            line.newLineNumber = j;
            reversed.append(line);
            ++additions;
            --j;
        } else if (i > 0 && (j == 0 || dp[i][j - 1] < dp[i - 1][j])) {
            DiffLine line;
            line.type = QStringLiteral("removed");
            line.content = oldLines.at(i - 1);
            line.oldLineNumber = i;
            reversed.append(line);
            ++deletions;
            --i;
        } else {
            break;
        }
    }
    std::reverse(reversed.begin(), reversed.end());

    DiffResult result;
    result.lines = reversed;
    result.additions = additions;
    result.deletions = deletions;
    return result;
}

QVariantMap DiffResult::toMap() const
{
    QVariantList rows;
    for (const DiffLine &line : lines) {
        QVariantMap map;
        map.insert(QStringLiteral("type"), line.type);
        map.insert(QStringLiteral("content"), line.content);
        map.insert(QStringLiteral("oldLineNumber"), line.oldLineNumber > 0 ? QVariant(line.oldLineNumber) : QVariant());
        map.insert(QStringLiteral("newLineNumber"), line.newLineNumber > 0 ? QVariant(line.newLineNumber) : QVariant());
        rows.append(map);
    }
    QVariantMap map;
    map.insert(QStringLiteral("lines"), rows);
    map.insert(QStringLiteral("additions"), additions);
    map.insert(QStringLiteral("deletions"), deletions);
    return map;
}
