#include "cardimage.h"

#include "markdown.h"

#include <QDateTime>
#include <QFont>
#include <QFontMetrics>
#include <QImage>
#include <QLocale>
#include <QPainter>
#include <QPainterPath>

QString renderNoteCardPng(const Note &note, const Project *project, const QString &destPath)
{
    const int width = 750;
    const int padding = 50;
    const QString snippet = plainTextSnippet(note.content, 420);
    QFont titleFont(QStringLiteral("Noto Sans CJK SC"));
    titleFont.setPixelSize(36);
    titleFont.setWeight(QFont::Bold);
    QFont bodyFont(QStringLiteral("Noto Sans CJK SC"));
    bodyFont.setPixelSize(22);
    QFont metaFont(QStringLiteral("Noto Sans Mono CJK SC"));
    metaFont.setPixelSize(18);

    const QFontMetrics bodyMetrics(bodyFont);
    const QRect bodyRect(0, 0, width - padding * 2, 2000);
    const QRect bodyBounds = bodyMetrics.boundingRect(bodyRect, Qt::TextWordWrap, snippet);
    const int imageBlock = note.images.isEmpty() ? 0 : 220;
    const int height = padding + 36 + 28 + 56 + bodyBounds.height() + 24 + imageBlock + 70;

    QImage canvas(width, qMax(height, 420), QImage::Format_ARGB32_Premultiplied);
    canvas.fill(Qt::white);
    QPainter painter(&canvas);
    painter.setRenderHint(QPainter::Antialiasing);
    painter.setPen(QColor(QStringLiteral("#e2e8f0")));
    painter.setBrush(Qt::white);
    painter.drawRoundedRect(QRectF(8, 8, width - 16, canvas.height() - 16), 28, 28);

    const QString color = project && !project->color.isEmpty() ? project->color : QStringLiteral("#10b981");
    painter.setPen(Qt::NoPen);
    painter.setBrush(QColor(color));
    painter.drawEllipse(QPointF(padding + 8, padding + 10), 8, 8);
    painter.setPen(QColor(QStringLiteral("#64748b")));
    painter.setFont(metaFont);
    const QString projectName = project ? project->name : QStringLiteral("默认项目");
    painter.drawText(padding + 26, padding + 16, projectName);

    painter.setPen(QColor(QStringLiteral("#0f172a")));
    painter.setFont(titleFont);
    const QString title = note.title.isEmpty() ? QStringLiteral("无标题便签") : note.title;
    painter.drawText(QRect(padding, padding + 36, width - padding * 2, 64), Qt::TextWordWrap, title);

    const QString date = QLocale(QLocale::Chinese).toString(QDateTime::fromMSecsSinceEpoch(note.updatedAt), QStringLiteral("yyyy/MM/dd HH:mm"));
    painter.setPen(QColor(QStringLiteral("#94a3b8")));
    painter.setFont(metaFont);
    painter.drawText(padding, padding + 112, QStringLiteral("更新时间：%1").arg(date));

    painter.setPen(QColor(QStringLiteral("#334155")));
    painter.setFont(bodyFont);
    painter.drawText(QRect(padding, padding + 140, width - padding * 2, bodyBounds.height() + 8), Qt::TextWordWrap, snippet);

    painter.setPen(QColor(color));
    painter.drawText(padding, canvas.height() - 36, QStringLiteral("项目便签"));
    painter.end();

    if (!canvas.save(destPath, "PNG"))
        return {};
    return destPath;
}
