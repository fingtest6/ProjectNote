#include "selftest.h"

#include "database.h"
#include "markdown.h"
#include "notesstore.h"
#include "syncservice.h"

#include <QDir>
#include <QJsonArray>
#include <QJsonObject>
#include <QTemporaryDir>
#include <QtGlobal>
#include <cstdio>

static int fail(const char *message)
{
    std::fprintf(stderr, "self-test failed: %s\n", message);
    return 1;
}

int runSelfTest()
{
    QTemporaryDir dir;
    if (!dir.isValid())
        return fail("temp dir");

    qputenv("PROJECTNOTE_SETTINGS", dir.filePath(QStringLiteral("settings.ini")).toUtf8());
    qputenv("PROJECTNOTE_NO_VAULT", "1");
    NotesStore store;
    if (!store.openAt(dir.filePath(QStringLiteral("notes.sqlite")), true))
        return fail("open");
    if (store.projectCount() != 3)
        return fail("seed projects");
    if (store.noteCount() != 3)
        return fail("seed notes");

    const QVariantMap welcome = store.noteById(QStringLiteral("note-welcome"));
    if (!welcome.value(QStringLiteral("pinned")).toBool())
        return fail("welcome pin");
    if (store.referenceCount(welcome.value(QStringLiteral("content")).toString()) < 1)
        return fail("wiki ref");
    const QString html = store.markdownHtml(QStringLiteral("**粗体** 和 [[note-welcome|欢迎]]"));
    if (!html.contains(QStringLiteral("<b>粗体</b>")) || !html.contains(QStringLiteral("note:note-welcome")))
        return fail("markdown html");

    const QVariantMap diff = store.diff(QStringLiteral("a\nb\nc"), QStringLiteral("a\nx\nc"));
    if (diff.value(QStringLiteral("additions")).toInt() != 1 || diff.value(QStringLiteral("deletions")).toInt() != 1)
        return fail("diff");

    const QVariantMap prefix = store.applyLinePrefix(QStringLiteral("正文"), 0, 2, QStringLiteral("# "));
    if (!prefix.value(QStringLiteral("text")).toString().startsWith(QStringLiteral("# ")))
        return fail("prefix");

    const ParsedImport imported = parseImportedMarkdown(QStringLiteral("导入便签.md"), QStringLiteral("# 标题甲\n\n正文"));
    if (imported.title != QStringLiteral("标题甲") || !imported.content.contains(QStringLiteral("正文"))) {
        std::fprintf(stderr, "title='%s' content='%s'\n", qPrintable(imported.title), qPrintable(imported.content));
        return fail("import parse");
    }

    QVariantMap created = store.saveNote(QVariantMap{
                                             {QStringLiteral("title"), QStringLiteral("测试便签")},
                                             {QStringLiteral("content"), QStringLiteral("第一行")},
                                             {QStringLiteral("projectId"), store.activeProjectId()},
                                         },
                                         QStringLiteral("初始创建便签"));
    if (created.value(QStringLiteral("id")).toString().isEmpty())
        return fail("create");
    const QString id = created.value(QStringLiteral("id")).toString();
    created.insert(QStringLiteral("content"), QStringLiteral("第一行\n第二行"));
    store.saveNote(created, QStringLiteral("补充一行"));
    const QVariantList histories = store.histories(id);
    if (histories.size() < 2)
        return fail("history");
    const QString copyId = store.duplicateNote(id).value(QStringLiteral("id")).toString();
    if (store.histories(copyId).size() < 2)
        return fail("duplicate history");
    const QString oldest = histories.last().toMap().value(QStringLiteral("id")).toString();
    store.restoreVersion(oldest);
    if (store.histories(id).size() != 1)
        return fail("restore");
    if (!store.deleteNote(id) || !store.noteById(id).isEmpty())
        return fail("soft delete");

    Repository repo;
    if (!repo.open(dir.filePath(QStringLiteral("merge.sqlite"))))
        return fail("merge db");
    SyncService sync(&repo);
    const qint64 now = nowMs();
    Project project;
    project.id = QStringLiteral("p1");
    project.name = QStringLiteral("本地");
    project.updatedAt = now;
    project.createdAt = now;
    repo.upsertProject(project);
    Note local;
    local.id = QStringLiteral("n1");
    local.projectId = QStringLiteral("p1");
    local.title = QStringLiteral("本地标题");
    local.content = QStringLiteral("旧");
    local.updatedAt = now;
    local.createdAt = now;
    repo.upsertNote(local);

    QJsonObject remoteNote;
    remoteNote.insert(QStringLiteral("id"), QStringLiteral("n1"));
    remoteNote.insert(QStringLiteral("projectId"), QStringLiteral("p1"));
    remoteNote.insert(QStringLiteral("title"), QStringLiteral("远端标题"));
    remoteNote.insert(QStringLiteral("content"), QStringLiteral("新"));
    remoteNote.insert(QStringLiteral("pinned"), false);
    remoteNote.insert(QStringLiteral("images"), QJsonArray());
    remoteNote.insert(QStringLiteral("tags"), QJsonArray());
    remoteNote.insert(QStringLiteral("createdAt"), now);
    remoteNote.insert(QStringLiteral("updatedAt"), now + 1000);
    QJsonObject remoteNew = remoteNote;
    remoteNew.insert(QStringLiteral("id"), QStringLiteral("n2"));
    remoteNew.insert(QStringLiteral("title"), QStringLiteral("新增"));
    QJsonObject payload;
    payload.insert(QStringLiteral("projects"), QJsonArray{project.toJson()});
    payload.insert(QStringLiteral("notes"), QJsonArray{remoteNote, remoteNew});
    payload.insert(QStringLiteral("histories"), QJsonArray());
    const SyncStats stats = sync.mergeForTest(payload, QStringLiteral("smart-merge"));
    if (stats.pulledNotes < 2 || repo.noteById(QStringLiteral("n1")).title != QStringLiteral("远端标题"))
        return fail("merge newer");
    if (repo.noteById(QStringLiteral("n2")).id.isEmpty())
        return fail("merge add");
    if (!sync.undo() || repo.noteById(QStringLiteral("n1")).title != QStringLiteral("本地标题"))
        return fail("undo");

    std::fprintf(stdout, "self-test ok\n");
    return 0;
}
