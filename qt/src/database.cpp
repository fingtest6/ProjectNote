#include "database.h"

#include <QDebug>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSqlError>
#include <QSqlQuery>
#include <QVariant>

namespace {
constexpr qint64 kTombstoneHistoryTtlMs = 30LL * 24 * 60 * 60 * 1000;
}

Repository::~Repository()
{
    const QString name = m_connection;
    if (m_db.isOpen())
        m_db.close();
    m_db = QSqlDatabase();
    if (!name.isEmpty())
        QSqlDatabase::removeDatabase(name);
}

bool Repository::exec(const QString &sql)
{
    QSqlQuery query(m_db);
    if (!query.exec(sql)) {
        qWarning() << "SQL failed:" << query.lastError().text() << sql;
        return false;
    }
    return true;
}

bool Repository::open(const QString &filePath)
{
    QDir().mkpath(QFileInfo(filePath).absolutePath());
    m_path = filePath;
    m_connection = QStringLiteral("projectnote-%1").arg(reinterpret_cast<quintptr>(this), 0, 16);
    m_db = QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), m_connection);
    m_db.setDatabaseName(filePath);
    if (!m_db.open()) {
        qWarning() << "Cannot open database" << filePath << m_db.lastError().text();
        return false;
    }
    exec(QStringLiteral("PRAGMA foreign_keys = ON"));
    exec(QStringLiteral(
        "CREATE TABLE IF NOT EXISTS projects ("
        "id TEXT PRIMARY KEY,"
        "name TEXT NOT NULL,"
        "color TEXT,"
        "icon TEXT,"
        "description TEXT,"
        "createdAt INTEGER NOT NULL,"
        "updatedAt INTEGER NOT NULL,"
        "deletedAt INTEGER,"
        "isDefault INTEGER NOT NULL DEFAULT 0)"));
    exec(QStringLiteral(
        "CREATE TABLE IF NOT EXISTS notes ("
        "id TEXT PRIMARY KEY,"
        "projectId TEXT NOT NULL,"
        "title TEXT,"
        "content TEXT,"
        "images TEXT,"
        "pinned INTEGER NOT NULL DEFAULT 0,"
        "tags TEXT,"
        "createdAt INTEGER NOT NULL,"
        "updatedAt INTEGER NOT NULL,"
        "deletedAt INTEGER)"));
    exec(QStringLiteral(
        "CREATE TABLE IF NOT EXISTS histories ("
        "id TEXT PRIMARY KEY,"
        "noteId TEXT NOT NULL,"
        "version INTEGER NOT NULL,"
        "commitMessage TEXT,"
        "title TEXT,"
        "content TEXT,"
        "timestamp INTEGER NOT NULL,"
        "charCount INTEGER NOT NULL)"));
    exec(QStringLiteral("CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(projectId)"));
    exec(QStringLiteral("CREATE INDEX IF NOT EXISTS idx_hist_note ON histories(noteId)"));
    return true;
}

Project Repository::projectFromQuery(QSqlQuery &query) const
{
    Project project;
    project.id = query.value(0).toString();
    project.name = query.value(1).toString();
    project.color = query.value(2).toString();
    project.icon = query.value(3).toString();
    project.description = query.value(4).toString();
    project.createdAt = query.value(5).toLongLong();
    project.updatedAt = query.value(6).toLongLong();
    project.deletedAt = query.value(7).isNull() ? 0 : query.value(7).toLongLong();
    project.isDefault = query.value(8).toInt() != 0;
    return project;
}

Note Repository::noteFromQuery(QSqlQuery &query) const
{
    Note note;
    note.id = query.value(0).toString();
    note.projectId = query.value(1).toString();
    note.title = query.value(2).toString();
    note.content = query.value(3).toString();
    note.images = parseStringList(query.value(4).toString());
    note.pinned = query.value(5).toInt() != 0;
    note.tags = parseStringList(query.value(6).toString());
    note.createdAt = query.value(7).toLongLong();
    note.updatedAt = query.value(8).toLongLong();
    note.deletedAt = query.value(9).isNull() ? 0 : query.value(9).toLongLong();
    return note;
}

NoteHistory Repository::historyFromQuery(QSqlQuery &query) const
{
    NoteHistory history;
    history.id = query.value(0).toString();
    history.noteId = query.value(1).toString();
    history.version = query.value(2).toInt();
    history.commitMessage = query.value(3).toString();
    history.title = query.value(4).toString();
    history.content = query.value(5).toString();
    history.timestamp = query.value(6).toLongLong();
    history.charCount = query.value(7).toInt();
    return history;
}

QVector<Project> Repository::projects(bool includeDeleted) const
{
    QVector<Project> rows;
    QSqlQuery query(m_db);
    query.prepare(includeDeleted
                      ? QStringLiteral("SELECT id,name,color,icon,description,createdAt,updatedAt,deletedAt,isDefault FROM projects ORDER BY createdAt ASC")
                      : QStringLiteral("SELECT id,name,color,icon,description,createdAt,updatedAt,deletedAt,isDefault FROM projects WHERE deletedAt IS NULL OR deletedAt = 0 ORDER BY createdAt ASC"));
    if (!query.exec())
        return rows;
    while (query.next())
        rows.append(projectFromQuery(query));
    return rows;
}

QVector<Note> Repository::notes(bool includeDeleted) const
{
    QVector<Note> rows;
    QSqlQuery query(m_db);
    query.prepare(includeDeleted
                      ? QStringLiteral("SELECT id,projectId,title,content,images,pinned,tags,createdAt,updatedAt,deletedAt FROM notes")
                      : QStringLiteral("SELECT id,projectId,title,content,images,pinned,tags,createdAt,updatedAt,deletedAt FROM notes WHERE deletedAt IS NULL OR deletedAt = 0"));
    if (!query.exec())
        return rows;
    while (query.next())
        rows.append(noteFromQuery(query));
    return rows;
}

QVector<NoteHistory> Repository::histories(const QString &noteId) const
{
    QVector<NoteHistory> rows;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT id,noteId,version,commitMessage,title,content,timestamp,charCount FROM histories WHERE noteId = ? ORDER BY version DESC"));
    query.addBindValue(noteId);
    if (!query.exec())
        return rows;
    while (query.next())
        rows.append(historyFromQuery(query));
    return rows;
}

QVector<NoteHistory> Repository::allHistories() const
{
    QVector<NoteHistory> rows;
    QSqlQuery query(m_db);
    if (!query.exec(QStringLiteral("SELECT id,noteId,version,commitMessage,title,content,timestamp,charCount FROM histories")))
        return rows;
    while (query.next())
        rows.append(historyFromQuery(query));
    return rows;
}

Project Repository::projectById(const QString &id) const
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT id,name,color,icon,description,createdAt,updatedAt,deletedAt,isDefault FROM projects WHERE id = ?"));
    query.addBindValue(id);
    if (query.exec() && query.next())
        return projectFromQuery(query);
    return {};
}

Note Repository::noteById(const QString &id) const
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("SELECT id,projectId,title,content,images,pinned,tags,createdAt,updatedAt,deletedAt FROM notes WHERE id = ?"));
    query.addBindValue(id);
    if (query.exec() && query.next())
        return noteFromQuery(query);
    return {};
}

bool Repository::hasProject(const QString &id) const
{
    return !projectById(id).id.isEmpty();
}

bool Repository::hasNote(const QString &id) const
{
    return !noteById(id).id.isEmpty();
}

void Repository::upsertProject(const Project &project)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO projects (id,name,color,icon,description,createdAt,updatedAt,deletedAt,isDefault) "
        "VALUES (?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,icon=excluded.icon,"
        "description=excluded.description,createdAt=excluded.createdAt,updatedAt=excluded.updatedAt,"
        "deletedAt=excluded.deletedAt,isDefault=excluded.isDefault"));
    query.addBindValue(project.id);
    query.addBindValue(project.name);
    query.addBindValue(project.color);
    query.addBindValue(project.icon);
    query.addBindValue(project.description);
    query.addBindValue(project.createdAt);
    query.addBindValue(project.updatedAt);
    if (project.deletedAt > 0)
        query.addBindValue(project.deletedAt);
    else
        query.addBindValue(QVariant());
    query.addBindValue(project.isDefault ? 1 : 0);
    if (!query.exec())
        qWarning() << "upsert project" << query.lastError().text();
}

void Repository::upsertNote(const Note &note)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT INTO notes (id,projectId,title,content,images,pinned,tags,createdAt,updatedAt,deletedAt) "
        "VALUES (?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET projectId=excluded.projectId,title=excluded.title,content=excluded.content,"
        "images=excluded.images,pinned=excluded.pinned,tags=excluded.tags,createdAt=excluded.createdAt,"
        "updatedAt=excluded.updatedAt,deletedAt=excluded.deletedAt"));
    query.addBindValue(note.id);
    query.addBindValue(note.projectId);
    query.addBindValue(note.title);
    query.addBindValue(note.content);
    query.addBindValue(jsonStringList(note.images));
    query.addBindValue(note.pinned ? 1 : 0);
    query.addBindValue(jsonStringList(note.tags));
    query.addBindValue(note.createdAt);
    query.addBindValue(note.updatedAt);
    if (note.deletedAt > 0)
        query.addBindValue(note.deletedAt);
    else
        query.addBindValue(QVariant());
    if (!query.exec())
        qWarning() << "upsert note" << query.lastError().text();
}

void Repository::addHistory(const NoteHistory &history)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral(
        "INSERT OR REPLACE INTO histories (id,noteId,version,commitMessage,title,content,timestamp,charCount) "
        "VALUES (?,?,?,?,?,?,?,?)"));
    query.addBindValue(history.id);
    query.addBindValue(history.noteId);
    query.addBindValue(history.version);
    query.addBindValue(history.commitMessage);
    query.addBindValue(history.title);
    query.addBindValue(history.content);
    query.addBindValue(history.timestamp);
    query.addBindValue(history.charCount);
    if (!query.exec())
        qWarning() << "add history" << query.lastError().text();
}

void Repository::deleteHistories(const QStringList &ids)
{
    if (ids.isEmpty())
        return;
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM histories WHERE id = ?"));
    for (const QString &id : ids) {
        query.addBindValue(id);
        query.exec();
        query.finish();
    }
}

void Repository::deleteHistoriesForNote(const QString &noteId)
{
    QSqlQuery query(m_db);
    query.prepare(QStringLiteral("DELETE FROM histories WHERE noteId = ?"));
    query.addBindValue(noteId);
    query.exec();
}

void Repository::clearAll()
{
    m_db.transaction();
    exec(QStringLiteral("DELETE FROM histories"));
    exec(QStringLiteral("DELETE FROM notes"));
    exec(QStringLiteral("DELETE FROM projects"));
    m_db.commit();
}

int Repository::liveProjectCount() const
{
    QSqlQuery query(m_db);
    query.exec(QStringLiteral("SELECT COUNT(*) FROM projects WHERE deletedAt IS NULL OR deletedAt = 0"));
    return query.next() ? query.value(0).toInt() : 0;
}

int Repository::liveNoteCount() const
{
    QSqlQuery query(m_db);
    query.exec(QStringLiteral("SELECT COUNT(*) FROM notes WHERE deletedAt IS NULL OR deletedAt = 0"));
    return query.next() ? query.value(0).toInt() : 0;
}

QJsonObject Repository::syncPayload(const QString &deviceId, const QString &deviceName) const
{
    QJsonArray projectsJson;
    for (const Project &project : projects(true))
        projectsJson.append(project.toJson());
    QJsonArray notesJson;
    for (const Note &note : notes(true))
        notesJson.append(note.toJson());
    QJsonArray historiesJson;
    for (const NoteHistory &history : allHistories())
        historiesJson.append(history.toJson());

    QJsonObject payload;
    payload.insert(QStringLiteral("deviceId"), deviceId);
    payload.insert(QStringLiteral("deviceName"), deviceName);
    payload.insert(QStringLiteral("timestamp"), nowMs());
    payload.insert(QStringLiteral("projects"), projectsJson);
    payload.insert(QStringLiteral("notes"), notesJson);
    payload.insert(QStringLiteral("histories"), historiesJson);
    return payload;
}

void Repository::replaceAll(const QVector<Project> &projectRows, const QVector<Note> &noteRows, const QVector<NoteHistory> &historyRows)
{
    m_db.transaction();
    exec(QStringLiteral("DELETE FROM histories"));
    exec(QStringLiteral("DELETE FROM notes"));
    exec(QStringLiteral("DELETE FROM projects"));
    for (const Project &project : projectRows)
        upsertProject(project);
    for (const Note &note : noteRows)
        upsertNote(note);
    for (const NoteHistory &history : historyRows)
        addHistory(history);
    m_db.commit();
}

Repository::Snapshot Repository::capture() const
{
    Snapshot snapshot;
    snapshot.projects = projects(true);
    snapshot.notes = notes(true);
    snapshot.histories = allHistories();
    return snapshot;
}

void Repository::restore(const Snapshot &snapshot)
{
    replaceAll(snapshot.projects, snapshot.notes, snapshot.histories);
}

void Repository::purgeExpiredTombstoneHistories()
{
    const qint64 cutoff = nowMs() - kTombstoneHistoryTtlMs;
    const QVector<Note> tombstones = [this] {
        QVector<Note> rows;
        for (const Note &note : notes(true)) {
            if (note.deletedAt > 0)
                rows.append(note);
        }
        return rows;
    }();

    for (Note note : tombstones) {
        if (note.deletedAt < cutoff)
            deleteHistoriesForNote(note.id);
        if (!note.content.isEmpty() || !note.images.isEmpty() || !note.tags.isEmpty()) {
            note.content.clear();
            note.images.clear();
            note.tags.clear();
            upsertNote(note);
        }
    }
}

void Repository::seedIfEmpty()
{
    if (liveProjectCount() > 0)
        return;

    const qint64 now = nowMs();
    Project welcome;
    welcome.id = QStringLiteral("proj-starter");
    welcome.name = QStringLiteral("🚀 欢迎与快速上手");
    welcome.color = QStringLiteral("#10b981");
    welcome.description = QStringLiteral("功能介绍与操作指南");
    welcome.createdAt = now - 3600 * 1000 * 24;
    welcome.updatedAt = welcome.createdAt;
    welcome.isDefault = true;

    Project work;
    work.id = QStringLiteral("proj-work");
    work.name = QStringLiteral("💼 移动端架构设计");
    work.color = QStringLiteral("#3b82f6");
    work.description = QStringLiteral("系统架构、原型与技术规划");
    work.createdAt = now - 3600 * 1000 * 12;
    work.updatedAt = work.createdAt;

    Project ideas;
    ideas.id = QStringLiteral("proj-ideas");
    ideas.name = QStringLiteral("💡 创意与灵感随笔");
    ideas.color = QStringLiteral("#f59e0b");
    ideas.description = QStringLiteral("随时捕获的灵感火花");
    ideas.createdAt = now - 3600 * 1000 * 6;
    ideas.updatedAt = ideas.createdAt;

    upsertProject(welcome);
    upsertProject(work);
    upsertProject(ideas);

    const QString note1Id = QStringLiteral("note-welcome");
    const QString note2Id = QStringLiteral("note-cross-ref-demo");
    const QString note3Id = QStringLiteral("note-arch");

    Note note1;
    note1.id = note1Id;
    note1.projectId = welcome.id;
    note1.title = QStringLiteral("✨ 欢迎使用项目便签应用");
    note1.content = QStringLiteral(
        "# 项目便签操作指南\n\n"
        "欢迎使用专为**项目管理**与**深度记录**打造的便签应用！\n\n"
        "### 核心特性演示：\n"
        "1. **顶部项目切换**：点击顶部导航栏中的项目名，随时快速切换不同项目空间。\n"
        "2. **记录交叉引用**：可以在正文输入 `[[` 或点击工具栏 🔗 引用其他便签，例如：\n"
        "   👉 关联参考：[[note-cross-ref-demo|双链交叉引用测试便签]]\n"
        "3. **Git 式修改历史**：点击右上角 🕒 历史图标，随时查看像 Git 一样的代码/文本提交差异（Diff），红绿清晰对比！\n"
        "4. **Markdown 渲染与待办**：\n"
        "   - [x] 支持待办清单勾选\n"
        "   - [x] 支持富文本、标题、代码块\n"
        "   - [ ] 支持点击导出为 Markdown 与高清长图\n"
        "5. **主题与暗黑模式**：点击右上角调色盘 🎨 可自由设定你喜爱的主题色或纯黑夜间模式。");
    note1.pinned = true;
    note1.tags = {QStringLiteral("指南"), QStringLiteral("特性")};
    note1.createdAt = now - 3600 * 1000 * 20;
    note1.updatedAt = now - 3600 * 1000 * 2;

    Note note2;
    note2.id = note2Id;
    note2.projectId = welcome.id;
    note2.title = QStringLiteral("🔗 双链交叉引用测试便签");
    note2.content = QStringLiteral(
        "这是被 [[note-welcome|欢迎使用项目便签应用]] 引用的便签。\n\n"
        "点击下方的“反向链接 (Backlinks)”或者从上方便签点击胶囊，即可互相跳转，非常适合：\n"
        "- 需求与设计稿对应\n"
        "- 灵感与任务关联\n"
        "- 跨项目笔记互相借用\n\n"
        "> 无论便签属于哪个项目，均支持全局跨项目引用！");
    note2.tags = {QStringLiteral("引用"), QStringLiteral("测试")};
    note2.createdAt = now - 3600 * 1000 * 18;
    note2.updatedAt = note2.createdAt;

    Note note3;
    note3.id = note3Id;
    note3.projectId = work.id;
    note3.title = QStringLiteral("📱 安卓端技术架构方案");
    note3.content = QStringLiteral(
        "## 技术选型总览\n\n"
        "- **前端技术栈**: React 18 + Tailwind CSS + Dexie.js (IndexedDB)\n"
        "- **移动打包方案**: Capacitor Android 原生容器\n"
        "- **核心组件**:\n"
        "  1. `Header`: 顶部下拉选择器快速切换项目\n"
        "  2. `MarkdownRenderer`: 支持 GFM、待办框与 `[[...]]` 交叉链接\n"
        "  3. `GitDiffViewer`: 类似 Git diff 的红绿行差异比对与一键版本回退\n\n"
        "```bash\n"
        "# 打包为安卓 APK\n"
        "npx cap add android\n"
        "npx cap copy\n"
        "npx cap open android\n"
        "```");
    note3.pinned = true;
    note3.tags = {QStringLiteral("架构"), QStringLiteral("Android")};
    note3.createdAt = now - 3600 * 1000 * 10;
    note3.updatedAt = note3.createdAt;

    upsertNote(note1);
    upsertNote(note2);
    upsertNote(note3);

    NoteHistory v1;
    v1.id = QStringLiteral("hist-1-v1");
    v1.noteId = note1Id;
    v1.version = 1;
    v1.commitMessage = QStringLiteral("初始创建便签");
    v1.title = QStringLiteral("欢迎使用项目便签应用");
    v1.content = QStringLiteral("# 项目便签操作指南\n\n欢迎使用专为项目管理与深度记录打造的便签应用！\n\n- [ ] 支持待办清单\n- [ ] 支持Markdown");
    v1.timestamp = note1.createdAt;
    v1.charCount = 75;

    NoteHistory v2;
    v2.id = QStringLiteral("hist-1-v2");
    v2.noteId = note1Id;
    v2.version = 2;
    v2.commitMessage = QStringLiteral("补充核心特性与双链引用");
    v2.title = note1.title;
    v2.content = note1.content;
    v2.timestamp = note1.updatedAt;
    v2.charCount = note1.content.size();
    addHistory(v1);
    addHistory(v2);
    Q_UNUSED(note2Id)
    Q_UNUSED(note3Id)
}
