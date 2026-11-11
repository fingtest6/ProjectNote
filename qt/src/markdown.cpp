#include "markdown.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonValue>
#include <QRegularExpression>
#include <QSet>

QString escapeHtml(const QString &text)
{
    QString out;
    out.reserve(text.size());
    for (const QChar ch : text) {
        switch (ch.unicode()) {
        case '&': out += QStringLiteral("&amp;"); break;
        case '<': out += QStringLiteral("&lt;"); break;
        case '>': out += QStringLiteral("&gt;"); break;
        case '"': out += QStringLiteral("&quot;"); break;
        case '\'': out += QStringLiteral("&#39;"); break;
        default: out += ch; break;
        }
    }
    return out;
}

QString plainTextSnippet(const QString &markdown, int maxLength)
{
    if (markdown.isEmpty())
        return {};
    QString text = markdown;
    text.replace(QRegularExpression(QStringLiteral("!\\[.*?\\]\\(.*?\\)")), QStringLiteral("[图片]"));
    text.replace(QRegularExpression(QStringLiteral("\\[\\[.*?\\|(.*?)\\]\\]")), QStringLiteral("\\1"));
    text.replace(QRegularExpression(QStringLiteral("\\[(.*?)\\]\\(.*?\\)")), QStringLiteral("\\1"));
    text.replace(QRegularExpression(QStringLiteral("```[\\s\\S]*?```")), QStringLiteral("[代码块]"));
    text.replace(QRegularExpression(QStringLiteral("`([^`]+)`")), QStringLiteral("\\1"));
    text.replace(QRegularExpression(QStringLiteral("^#+\\s+"), QRegularExpression::MultilineOption), QString());
    text.replace(QRegularExpression(QStringLiteral("[*_~`>#-]")), QString());
    text = text.simplified();
    if (text.size() > maxLength)
        return text.left(maxLength) + QStringLiteral("...");
    return text;
}

QVector<QPair<QString, QString>> extractReferences(const QString &content)
{
    QVector<QPair<QString, QString>> refs;
    QSet<QString> seen;
    static const QRegularExpression re(QStringLiteral("\\[\\[([a-zA-Z0-9_-]+)\\|([^\\]]+)\\]\\]"));
    auto it = re.globalMatch(content);
    while (it.hasNext()) {
        const auto match = it.next();
        const QString id = match.captured(1);
        if (seen.contains(id))
            continue;
        seen.insert(id);
        refs.append({id, match.captured(2)});
    }
    return refs;
}

static QString inlineFormat(const QString &source, const QString &primary)
{
    QString out;
    const int n = source.size();
    for (int i = 0; i < n;) {
        if (i + 1 < n && source[i] == QLatin1Char('[') && source[i + 1] == QLatin1Char('[')) {
            const int close = source.indexOf(QLatin1String("]]"), i + 2);
            const int bar = source.indexOf(QLatin1Char('|'), i + 2);
            if (close > bar && bar > i + 2) {
                const QString id = source.mid(i + 2, bar - (i + 2));
                const QString title = source.mid(bar + 1, close - bar - 1);
                if (QRegularExpression(QStringLiteral("^[A-Za-z0-9_-]+$")).match(id).hasMatch()) {
                    out += QStringLiteral("<a href=\"note:%1\" style=\"color:%2;text-decoration:none;\">🔗 %3</a>")
                               .arg(escapeHtml(id), primary, escapeHtml(title));
                    i = close + 2;
                    continue;
                }
            }
        }
        if (source.mid(i, 2) == QLatin1String("**")) {
            const int end = source.indexOf(QLatin1String("**"), i + 2);
            if (end > i + 2) {
                out += QStringLiteral("<b>%1</b>").arg(inlineFormat(source.mid(i + 2, end - i - 2), primary));
                i = end + 2;
                continue;
            }
        }
        if (source.mid(i, 2) == QLatin1String("~~")) {
            const int end = source.indexOf(QLatin1String("~~"), i + 2);
            if (end > i + 2) {
                out += QStringLiteral("<s>%1</s>").arg(inlineFormat(source.mid(i + 2, end - i - 2), primary));
                i = end + 2;
                continue;
            }
        }
        if (source[i] == QLatin1Char('`')) {
            const int end = source.indexOf(QLatin1Char('`'), i + 1);
            if (end > i) {
                out += QStringLiteral("<span style=\"font-family:'Noto Sans Mono CJK SC','DejaVu Sans Mono',monospace;background-color:#e2e8f0;color:%1;\"> %2 </span>")
                           .arg(primary, escapeHtml(source.mid(i + 1, end - i - 1)));
                i = end + 1;
                continue;
            }
        }
        if (source[i] == QLatin1Char('*') || source[i] == QLatin1Char('_')) {
            const QChar mark = source[i];
            const int end = source.indexOf(mark, i + 1);
            if (end > i + 1 && source[i + 1] != QLatin1Char(' ')) {
                out += QStringLiteral("<i>%1</i>").arg(inlineFormat(source.mid(i + 1, end - i - 1), primary));
                i = end + 1;
                continue;
            }
        }
        if (source[i] == QLatin1Char('[') && (i == 0 || source[i - 1] != QLatin1Char('!'))) {
            const int mid = source.indexOf(QLatin1String("]("), i + 1);
            const int end = mid > 0 ? source.indexOf(QLatin1Char(')'), mid + 2) : -1;
            if (mid > i && end > mid) {
                const QString label = source.mid(i + 1, mid - i - 1);
                const QString href = source.mid(mid + 2, end - mid - 2);
                if (href.startsWith(QLatin1String("http://")) || href.startsWith(QLatin1String("https://"))) {
                    out += QStringLiteral("<a href=\"%1\" style=\"color:%2;\">%3</a>")
                               .arg(escapeHtml(href), primary, inlineFormat(label, primary));
                    i = end + 1;
                    continue;
                }
            }
        }
        if (source[i] == QLatin1Char('!') && i + 1 < n && source[i + 1] == QLatin1Char('[')) {
            const int mid = source.indexOf(QLatin1String("]("), i + 2);
            const int end = mid > 0 ? source.indexOf(QLatin1Char(')'), mid + 2) : -1;
            if (mid > i && end > mid) {
                i = end + 1;
                continue;
            }
        }
        out += escapeHtml(QString(source[i]));
        ++i;
    }
    return out;
}

QString markdownToHtml(const QString &markdown, const QString &primary, bool dark)
{
    const QString textColor = dark ? QStringLiteral("#e4e4e7") : QStringLiteral("#1e293b");
    const QString muted = dark ? QStringLiteral("#a1a1aa") : QStringLiteral("#64748b");
    const QString quoteBg = dark ? QStringLiteral("#18181b") : QStringLiteral("#f8fafc");
    const QString codeBg = dark ? QStringLiteral("#27272a") : QStringLiteral("#f1f5f9");
    const QStringList lines = markdown.split(QLatin1Char('\n'));
    QString html = QStringLiteral("<body style=\"color:%1;font-family:'Noto Sans CJK SC',sans-serif;font-size:14px;\">").arg(textColor);

    auto flushParagraph = [&](QStringList &buffer) {
        if (buffer.isEmpty())
            return;
        QStringList parts;
        for (const QString &line : buffer)
            parts.append(inlineFormat(line, primary));
        html += QStringLiteral("<p>%1</p>").arg(parts.join(QStringLiteral("<br/>")));
        buffer.clear();
    };

    QStringList paragraph;
    bool inCode = false;
    QString code;
    QString codeLang;
    bool inQuote = false;
    QStringList quote;
    bool inList = false;
    bool listOrdered = false;
    QStringList items;

    auto flushQuote = [&] {
        if (!inQuote)
            return;
        QStringList parts;
        for (const QString &line : quote)
            parts.append(inlineFormat(line, primary));
        html += QStringLiteral("<blockquote style=\"border-left:3px solid %1;padding-left:8px;color:%2;background-color:%3;\">%4</blockquote>")
                    .arg(primary, muted, quoteBg, parts.join(QStringLiteral("<br/>")));
        quote.clear();
        inQuote = false;
    };
    auto flushList = [&] {
        if (!inList)
            return;
        html += listOrdered ? QStringLiteral("<ol>") : QStringLiteral("<ul>");
        for (const QString &item : items)
            html += QStringLiteral("<li>%1</li>").arg(item);
        html += listOrdered ? QStringLiteral("</ol>") : QStringLiteral("</ul>");
        items.clear();
        inList = false;
    };

    for (int index = 0; index < lines.size(); ++index) {
        const QString line = lines.at(index);
        const QString trimmed = line.trimmed();
        if (!inCode && trimmed.startsWith(QLatin1String("```"))) {
            flushParagraph(paragraph);
            flushQuote();
            flushList();
            inCode = true;
            codeLang = trimmed.mid(3).trimmed();
            code.clear();
            continue;
        }
        if (inCode) {
            if (trimmed.startsWith(QLatin1String("```"))) {
                html += QStringLiteral("<pre style=\"background-color:#1e293b;color:#e2e8f0;padding:8px;\">%1</pre>")
                            .arg(escapeHtml(code));
                inCode = false;
                Q_UNUSED(codeLang);
            } else {
                if (!code.isEmpty())
                    code += QLatin1Char('\n');
                code += line;
            }
            continue;
        }
        if (trimmed.isEmpty()) {
            flushParagraph(paragraph);
            flushQuote();
            flushList();
            continue;
        }
        if (trimmed.startsWith(QLatin1String(">"))) {
            flushParagraph(paragraph);
            flushList();
            inQuote = true;
            QString body = trimmed.mid(1).trimmed();
            quote.append(body);
            continue;
        }
        flushQuote();

        static const QRegularExpression headingRe(QStringLiteral("^(#{1,6})\\s+(.+)$"));
        const auto heading = headingRe.match(trimmed);
        if (heading.hasMatch()) {
            flushParagraph(paragraph);
            flushList();
            const int level = heading.captured(1).size();
            const int size = 22 - (level - 1) * 2;
            html += QStringLiteral("<h%1 style=\"font-size:%2px;\">%3</h%1>")
                        .arg(level)
                        .arg(size)
                        .arg(inlineFormat(heading.captured(2), primary));
            continue;
        }
        if (trimmed == QLatin1String("---") || trimmed == QLatin1String("***")) {
            flushParagraph(paragraph);
            flushList();
            html += QStringLiteral("<hr/>");
            continue;
        }
        static const QRegularExpression taskRe(QStringLiteral("^\\s*[-*+]\\s+\\[([ xX])\\]\\s+(.*)$"));
        static const QRegularExpression ulRe(QStringLiteral("^\\s*[-*+]\\s+(.*)$"));
        static const QRegularExpression olRe(QStringLiteral("^\\s*\\d+\\.\\s+(.*)$"));
        const auto task = taskRe.match(line);
        const auto ul = ulRe.match(line);
        const auto ol = olRe.match(line);
        if (task.hasMatch() || ul.hasMatch() || ol.hasMatch()) {
            flushParagraph(paragraph);
            const bool ordered = ol.hasMatch();
            if (inList && listOrdered != ordered)
                flushList();
            inList = true;
            listOrdered = ordered;
            QString body;
            if (task.hasMatch()) {
                const bool checked = task.captured(1).toLower() == QLatin1String("x");
                body = (checked ? QStringLiteral("☑ ") : QStringLiteral("☐ ")) + inlineFormat(task.captured(2), primary);
            } else if (ol.hasMatch()) {
                body = inlineFormat(ol.captured(1), primary);
            } else {
                body = inlineFormat(ul.captured(1), primary);
            }
            items.append(body);
            continue;
        }
        flushList();
        paragraph.append(line);
        Q_UNUSED(codeBg);
    }
    if (inCode) {
        html += QStringLiteral("<pre style=\"background-color:#1e293b;color:#e2e8f0;padding:8px;\">%1</pre>").arg(escapeHtml(code));
    }
    flushParagraph(paragraph);
    flushQuote();
    flushList();
    html += QStringLiteral("</body>");
    return html;
}

ParsedImport parseImportedMarkdown(const QString &filename, const QString &rawContent)
{
    QString text = rawContent;
    text.replace(QStringLiteral("\r\n"), QStringLiteral("\n"));
    QStringList images;
    static const QRegularExpression base64Re(QStringLiteral("!\\[(.*?)\\]\\((data:image\\/[a-zA-Z]+;base64,[^)]+)\\)"));
    auto it = base64Re.globalMatch(text);
    while (it.hasNext()) {
        const QString image = it.next().captured(2);
        if (!images.contains(image))
            images.append(image);
    }
    text.replace(base64Re, QString());
    text = text.trimmed();

    QString fileTitle = filename;
    fileTitle.replace(QRegularExpression(QStringLiteral("\\.(md|markdown|txt)$"), QRegularExpression::CaseInsensitiveOption), QString());
    fileTitle = fileTitle.trimmed();
    QString title = fileTitle.isEmpty() ? QStringLiteral("导入便签") : fileTitle;

    QStringList lines = text.split(QLatin1Char('\n'));
    int first = -1;
    for (int i = 0; i < lines.size(); ++i) {
        if (!lines.at(i).trimmed().isEmpty()) {
            first = i;
            break;
        }
    }
    if (first >= 0) {
        const QString line = lines.at(first).trimmed();
        if (line.startsWith(QLatin1String("# ")) && !line.startsWith(QLatin1String("##"))) {
            const QString heading = line.mid(2).trimmed();
            if (fileTitle.isEmpty() || fileTitle == QStringLiteral("导入便签") || fileTitle == heading) {
                title = heading;
                lines.removeAt(first);
                text = lines.join(QLatin1Char('\n')).trimmed();
            }
        }
    }
    if (title.isEmpty())
        title = QStringLiteral("导入便签");
    return {title, text, images};
}

QString sanitizeFilename(const QString &name, int maxLen)
{
    QString cleaned = name.isEmpty() ? QStringLiteral("未命名") : name;
    cleaned.replace(QRegularExpression(QStringLiteral("[\\\\/:*?\"<>|]")), QStringLiteral("_"));
    cleaned = cleaned.trimmed();
    if (cleaned.isEmpty())
        cleaned = QStringLiteral("未命名");
    return cleaned.left(maxLen);
}

QString noteToMarkdown(const Note &note, const Project *project)
{
    const QString projectName = project ? project->name : QStringLiteral("默认项目");
    auto jsonString = [](const QString &value) {
        return QString::fromUtf8(QJsonDocument(QJsonArray{value}).toJson(QJsonDocument::Compact)).mid(1).chopped(1);
    };
    QStringList tagJson;
    for (const QString &tag : note.tags)
        tagJson.append(jsonString(tag));
    QString body = note.content;
    if (!note.images.isEmpty()) {
        QStringList images;
        images.append(QStringLiteral("\n\n<!-- ATTACHED_IMAGES_START -->"));
        for (int i = 0; i < note.images.size(); ++i)
            images.append(QStringLiteral("![附件图片 %1](%2)").arg(i + 1).arg(note.images.at(i)));
        images.append(QStringLiteral("<!-- ATTACHED_IMAGES_END -->\n"));
        body += images.join(QLatin1Char('\n'));
    }
    return QStringLiteral("---\nid: %1\nprojectId: %2\nprojectName: %3\ntitle: %4\npinned: %5\ntags: [%6]\ncreatedAt: %7\nupdatedAt: %8\n---\n\n%9")
        .arg(jsonString(note.id),
             jsonString(note.projectId),
             jsonString(projectName),
             jsonString(note.title),
             note.pinned ? QStringLiteral("true") : QStringLiteral("false"),
             tagJson.join(QLatin1Char(',')),
             QString::number(note.createdAt),
             QString::number(note.updatedAt),
             body);
}

QVariantMap applyLinePrefix(const QString &text, int start, int end, const QString &targetPrefix)
{
    const int firstLineStart = text.lastIndexOf(QLatin1Char('\n'), start - 1) + 1;
    int lastLineEnd = text.indexOf(QLatin1Char('\n'), end);
    if (lastLineEnd < 0)
        lastLineEnd = text.size();
    const QString selectedBlock = text.mid(firstLineStart, lastLineEnd - firstLineStart);
    const QStringList lines = selectedBlock.split(QLatin1Char('\n'));
    const QRegularExpression headingRe(QStringLiteral("^#{1,6}\\s+"));
    const QRegularExpression taskRe(QStringLiteral("^-\\s+\\[([ xX])\\]\\s+"));
    const QRegularExpression listRe(QStringLiteral("^[-*+]\\s+"));
    const QRegularExpression quoteRe(QStringLiteral("^>\\s+"));
    const bool isHeading = targetPrefix.startsWith(QLatin1Char('#'));
    const bool isTask = targetPrefix.startsWith(QLatin1String("- [ ]"));
    const bool isList = targetPrefix == QLatin1String("- ");
    const bool isQuote = targetPrefix == QLatin1String("> ");

    QStringList updated;
    for (const QString &line : lines) {
        if (isHeading) {
            if (line.startsWith(targetPrefix))
                updated.append(QString(line).replace(headingRe, QString()));
            else
                updated.append(targetPrefix + QString(line).replace(headingRe, QString()));
        } else if (isTask) {
            if (taskRe.match(line).hasMatch())
                updated.append(QString(line).replace(taskRe, QString()));
            else if (listRe.match(line).hasMatch())
                updated.append(QString(line).replace(listRe, targetPrefix));
            else
                updated.append(targetPrefix + line);
        } else if (isList) {
            if (taskRe.match(line).hasMatch())
                updated.append(QString(line).replace(taskRe, targetPrefix));
            else if (listRe.match(line).hasMatch())
                updated.append(QString(line).replace(listRe, QString()));
            else
                updated.append(targetPrefix + line);
        } else if (isQuote) {
            if (quoteRe.match(line).hasMatch())
                updated.append(QString(line).replace(quoteRe, QString()));
            else
                updated.append(targetPrefix + line);
        } else if (line.startsWith(targetPrefix)) {
            updated.append(line.mid(targetPrefix.size()));
        } else {
            updated.append(targetPrefix + line);
        }
    }
    const QString replaced = updated.join(QLatin1Char('\n'));
    const QString newText = text.left(firstLineStart) + replaced + text.mid(lastLineEnd);
    int newStart = start;
    int newEnd = end;
    if (start == end) {
        const int lengthDiff = replaced.size() - selectedBlock.size();
        newStart = qBound(firstLineStart, start + lengthDiff, newText.size());
        newEnd = newStart;
    } else {
        newStart = firstLineStart;
        newEnd = firstLineStart + replaced.size();
    }
    return {{QStringLiteral("text"), newText}, {QStringLiteral("start"), newStart}, {QStringLiteral("end"), newEnd}};
}

QVariantMap wrapSelection(const QString &text, int start, int end, const QString &tag, const QString &placeholder)
{
    const QString selected = text.mid(start, end - start);
    auto result = [](const QString &value, int a, int b) {
        return QVariantMap{{QStringLiteral("text"), value}, {QStringLiteral("start"), a}, {QStringLiteral("end"), b}};
    };
    if (!selected.isEmpty()) {
        if (selected.startsWith(tag) && selected.endsWith(tag) && selected.size() >= tag.size() * 2) {
            const QString unwrapped = selected.mid(tag.size(), selected.size() - tag.size() * 2);
            return result(text.left(start) + unwrapped + text.mid(end), start, start + unwrapped.size());
        }
        const QString before = text.mid(qMax(0, start - tag.size()), qMin(tag.size(), start));
        const QString after = text.mid(end, tag.size());
        if (before == tag && after == tag) {
            return result(text.left(start - tag.size()) + selected + text.mid(end + tag.size()), start - tag.size(), end - tag.size());
        }
        return result(text.left(start) + tag + selected + tag + text.mid(end), start + tag.size(), end + tag.size());
    }
    const QString before = text.mid(qMax(0, start - tag.size()), qMin(tag.size(), start));
    const QString after = text.mid(start, tag.size());
    if (before == tag && after == tag) {
        return result(text.left(start - tag.size()) + text.mid(start + tag.size()), start - tag.size(), start - tag.size());
    }
    return result(text.left(start) + tag + placeholder + tag + text.mid(end), start + tag.size(), start + tag.size() + placeholder.size());
}

QVariantMap smartEnter(const QString &text, int cursor)
{
    const int lineStart = text.lastIndexOf(QLatin1Char('\n'), cursor - 1) + 1;
    const QString currentLine = text.mid(lineStart, cursor - lineStart);
    auto done = [&](const QString &value, int pos) {
        return QVariantMap{{QStringLiteral("handled"), true}, {QStringLiteral("text"), value}, {QStringLiteral("cursor"), pos}};
    };
    if (QRegularExpression(QStringLiteral("^-\\s+\\[([ xX])\\]\\s*$")).match(currentLine).hasMatch()
        || QRegularExpression(QStringLiteral("^[-*+]\\s*$")).match(currentLine).hasMatch()
        || QRegularExpression(QStringLiteral("^>\\s*$")).match(currentLine).hasMatch()) {
        return done(text.left(lineStart) + text.mid(cursor), lineStart);
    }
    if (QRegularExpression(QStringLiteral("^-\\s+\\[([ xX])\\]\\s+.+$")).match(currentLine).hasMatch()) {
        const QString insertion = QStringLiteral("\n- [ ] ");
        return done(text.left(cursor) + insertion + text.mid(cursor), cursor + insertion.size());
    }
    if (QRegularExpression(QStringLiteral("^[-*+]\\s+.+$")).match(currentLine).hasMatch()) {
        const QString insertion = QStringLiteral("\n- ");
        return done(text.left(cursor) + insertion + text.mid(cursor), cursor + insertion.size());
    }
    if (QRegularExpression(QStringLiteral("^>\\s+.+$")).match(currentLine).hasMatch()) {
        const QString insertion = QStringLiteral("\n> ");
        return done(text.left(cursor) + insertion + text.mid(cursor), cursor + insertion.size());
    }
    return {{QStringLiteral("handled"), false}, {QStringLiteral("text"), text}, {QStringLiteral("cursor"), cursor}};
}

QVariantMap insertIndent(const QString &text, int cursor)
{
    const QString indent = QStringLiteral("  ");
    return {{QStringLiteral("text"), text.left(cursor) + indent + text.mid(cursor)},
            {QStringLiteral("cursor"), cursor + indent.size()}};
}
