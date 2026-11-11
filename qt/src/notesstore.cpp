#include "notesstore.h"

#include "cardimage.h"
#include "markdown.h"

#include <algorithm>

#include <QBuffer>
#include <QColor>
#include <QDateTime>
#include <QClipboard>
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QGuiApplication>
#include <QHostInfo>
#include <QSettings>
#include <QImage>
#include <QJsonDocument>
#include <QLocale>
#include <QPalette>
#include <QQuickWindow>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QUrl>
#include <QUuid>

namespace {
struct Preset { const char *id; const char *name; const char *color; };
const Preset kPresets[] = {
    {"emerald", "极光绿", "#10b981"},
    {"sapphire", "克莱因蓝", "#3b82f6"},
    {"violet", "晚霞紫", "#8b5cf6"},
    {"sunset", "落日橙", "#f97316"},
    {"rose", "胭脂粉", "#f43f5e"},
    {"amber", "琥珀金", "#d97706"},
    {"cyan", "薄荷青", "#06b6d4"},
    {"slate", "极简灰", "#64748b"},
};

QString argb(const QString &hex, int alpha)
{
    QString body = hex.startsWith(QLatin1Char('#')) ? hex.mid(1) : hex;
    if (body.size() != 6)
        return hex;
    return QStringLiteral("#%1%2").arg(alpha, 2, 16, QLatin1Char('0')).arg(body);
}
}

NotesStore::NotesStore(QObject *parent)
    : QObject(parent)
    , m_sync(&m_repo, this)
{
    const QByteArray settingsPath = qgetenv("PROJECTNOTE_SETTINGS");
    if (!settingsPath.isEmpty())
        m_settings = std::make_unique<QSettings>(QString::fromUtf8(settingsPath), QSettings::IniFormat);
    else
        m_settings = std::make_unique<QSettings>(QStringLiteral("rduteam"), QStringLiteral("ProjectNote"));
    m_visible = new VariantListModel(this);
    m_projects = new VariantListModel(this);
    connect(&m_sync, &SyncService::incomingChanged, this, &NotesStore::syncChanged);
    connect(&m_sync, &SyncService::devicesChanged, this, &NotesStore::syncChanged);
    connect(&m_sync, &SyncService::pinChanged, this, &NotesStore::syncChanged);
    connect(&m_sync, &SyncService::dataMutated, this, [this] { reload(); });
    connect(&m_sync, &SyncService::finished, this, [this](const QVariantMap &result) {
        m_report = result;
        m_hasReport = true;
        const qint64 ts = nowMs();
        m_lastSyncText = QStringLiteral("%1 · %2").arg(QLocale(QLocale::Chinese).toString(QDateTime::fromMSecsSinceEpoch(ts), QStringLiteral("HH:mm:ss")), result.value(QStringLiteral("message")).toString());
        emit syncChanged();
    });
}

NotesStore::~NotesStore() = default;

bool NotesStore::openDefault()
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    return openAt(dir + QStringLiteral("/projectnote.sqlite"), true);
}

bool NotesStore::openAt(const QString &path, bool seed)
{
    if (!m_repo.open(path))
        return false;
    if (seed) {
        m_repo.seedIfEmpty();
        m_repo.purgeExpiredTombstoneHistories();
    }
    loadSettings();
    m_sync.setIdentity(m_deviceId, m_deviceName);
    m_sync.setPin(m_settings->value(QStringLiteral("sync/pin"), QStringLiteral("888888")).toString());
    m_sync.setVaultHooks(
        [this](const Note &note) { mirror(note); },
        [this](const QString &title, const QString &projectName) { deleteNoteFile(m_vault, title, projectName); });
    m_sync.setRaiseHook([this] {
        if (!m_window)
            return;
        if (m_window->visibility() == QWindow::Minimized)
            m_window->showNormal();
        m_window->show();
        m_window->raise();
        m_window->requestActivate();
    });
    m_sync.listen(25860);
    const QStringList ips = m_sync.localIpv4();
    m_selectedIp = m_settings->value(QStringLiteral("sync/selectedIp")).toString();
    if (!ips.contains(m_selectedIp))
        m_selectedIp = ips.value(0);
    reload();
    emit syncChanged();
    emit themeChanged();
    emit vaultChanged();
    return true;
}

void NotesStore::loadSettings()
{
    m_activeProjectId = m_settings->value(QStringLiteral("activeProject")).toString();
    m_mode = m_settings->value(QStringLiteral("theme/mode"), QStringLiteral("system")).toString();
    m_presetId = m_settings->value(QStringLiteral("theme/preset"), QStringLiteral("emerald")).toString();
    m_primary = m_settings->value(QStringLiteral("theme/color"), QStringLiteral("#10b981")).toString();
    applySystemDark();
    m_deviceId = m_settings->value(QStringLiteral("device/id")).toString();
    if (m_deviceId.isEmpty()) {
        m_deviceId = QStringLiteral("dev-%1").arg(QUuid::createUuid().toString(QUuid::Id128).left(12));
        m_settings->setValue(QStringLiteral("device/id"), m_deviceId);
    }
    m_deviceName = m_settings->value(QStringLiteral("device/name")).toString();
    if (m_deviceName.isEmpty()) {
        m_deviceName = QStringLiteral("%1 (Qt 桌面端)").arg(QHostInfo::localHostName());
        m_settings->setValue(QStringLiteral("device/name"), m_deviceName);
    }
    m_vault.enabled = m_settings->value(QStringLiteral("vault/enabled"), true).toBool();
    m_vault.autoExportOnSave = m_settings->value(QStringLiteral("vault/auto"), true).toBool();
    m_vault.folderPath = m_settings->value(QStringLiteral("vault/path"), defaultVaultPath()).toString();
    if (qEnvironmentVariableIntValue("PROJECTNOTE_NO_VAULT") == 1) {
        m_vault.enabled = false;
        m_vault.autoExportOnSave = false;
    }
}

void NotesStore::saveSettings()
{
    m_settings->setValue(QStringLiteral("activeProject"), m_activeProjectId);
    m_settings->setValue(QStringLiteral("theme/mode"), m_mode);
    m_settings->setValue(QStringLiteral("theme/preset"), m_presetId);
    m_settings->setValue(QStringLiteral("theme/color"), m_primary);
    m_settings->setValue(QStringLiteral("sync/selectedIp"), m_selectedIp);
    m_settings->setValue(QStringLiteral("vault/enabled"), m_vault.enabled);
    m_settings->setValue(QStringLiteral("vault/auto"), m_vault.autoExportOnSave);
    m_settings->setValue(QStringLiteral("vault/path"), m_vault.folderPath);
}

void NotesStore::applySystemDark()
{
    const QColor window = QGuiApplication::palette().color(QPalette::Window);
    m_systemDark = window.lightness() < 128;
    m_dark = m_mode == QLatin1String("dark") || (m_mode == QLatin1String("system") && m_systemDark);
}

void NotesStore::setWindow(QQuickWindow *window)
{
    m_window = window;
}

QString NotesStore::bgColor() const { return m_dark ? QStringLiteral("#09090b") : QStringLiteral("#f8fafc"); }
QString NotesStore::surfaceColor() const { return m_dark ? QStringLiteral("#18181b") : QStringLiteral("#ffffff"); }
QString NotesStore::headerColor() const { return m_dark ? QStringLiteral("#e618181b") : QStringLiteral("#e6ffffff"); }
QString NotesStore::textColor() const { return m_dark ? QStringLiteral("#f4f4f5") : QStringLiteral("#0f172a"); }
QString NotesStore::secondaryColor() const { return m_dark ? QStringLiteral("#e4e4e7") : QStringLiteral("#1e293b"); }
QString NotesStore::mutedColor() const { return m_dark ? QStringLiteral("#a1a1aa") : QStringLiteral("#64748b"); }
QString NotesStore::faintColor() const { return m_dark ? QStringLiteral("#71717a") : QStringLiteral("#94a3b8"); }
QString NotesStore::borderColor() const { return m_dark ? QStringLiteral("#27272a") : QStringLiteral("#e2e8f0"); }
QString NotesStore::chipColor() const { return m_dark ? QStringLiteral("#27272a") : QStringLiteral("#f1f5f9"); }
QString NotesStore::inputColor() const { return m_dark ? QStringLiteral("#27272a") : QStringLiteral("#f8fafc"); }
QString NotesStore::primarySoft() const { return argb(m_primary, m_dark ? 46 : 20); }

void NotesStore::reload()
{
    QVariantList projectRows;
    m_liveNotes = m_repo.notes(false);
    const QVector<Project> projectList = m_repo.projects(false);
    m_counts.clear();
    for (const Note &note : m_liveNotes)
        m_counts[note.projectId] = m_counts.value(note.projectId).toInt() + 1;
    for (const Project &project : projectList)
        projectRows.append(project.toMap());
    m_projects->reset(projectRows);
    reconcileActiveProject();

    const QString query = m_search.trimmed().toLower();
    const bool all = m_globalSearch && !query.isEmpty();
    QVector<Note> visible;
    for (const Note &note : m_liveNotes) {
        if (!all && note.projectId != m_activeProjectId)
            continue;
        if (!query.isEmpty() && !note.title.toLower().contains(query) && !note.content.toLower().contains(query))
            continue;
        visible.append(note);
    }
    std::sort(visible.begin(), visible.end(), [](const Note &a, const Note &b) {
        if (a.pinned != b.pinned)
            return a.pinned && !b.pinned;
        return a.updatedAt > b.updatedAt;
    });
    QVariantList rows;
    for (const Note &note : visible)
        rows.append(presentNote(note));
    m_visible->reset(rows);
    emit notesChanged();
    emit activeProjectChanged();
}

void NotesStore::reconcileActiveProject()
{
    const QVector<Project> projectList = m_repo.projects(false);
    if (projectList.isEmpty()) {
        m_activeProjectId.clear();
        return;
    }
    const bool valid = std::any_of(projectList.cbegin(), projectList.cend(), [&](const Project &project) {
        return project.id == m_activeProjectId;
    });
    if (valid)
        return;
    const Project *chosen = &projectList.first();
    for (const Project &project : projectList) {
        if (project.isDefault) {
            chosen = &project;
            break;
        }
    }
    m_activeProjectId = chosen->id;
    saveSettings();
}

QVariantMap NotesStore::activeProject() const
{
    return findProject(m_activeProjectId).toMap();
}

int NotesStore::noteCount() const
{
    return m_liveNotes.size();
}

void NotesStore::setSearchQuery(const QString &query)
{
    if (m_search == query)
        return;
    m_search = query;
    reload();
    emit searchChanged();
}

void NotesStore::toggleSearch()
{
    m_searchOpen = !m_searchOpen;
    if (!m_searchOpen)
        m_search.clear();
    reload();
    emit searchChanged();
}

void NotesStore::toggleGlobalSearch()
{
    m_globalSearch = !m_globalSearch;
    reload();
    emit searchChanged();
}

void NotesStore::selectProject(const QString &id)
{
    m_activeProjectId = id;
    saveSettings();
    reload();
}

QString NotesStore::createProject(const QString &name, const QString &color, const QString &description)
{
    const qint64 now = nowMs();
    Project project;
    project.id = makeId(QStringLiteral("proj-"));
    project.name = name.trimmed();
    project.color = color;
    project.description = description.trimmed();
    project.createdAt = now;
    project.updatedAt = now;
    m_repo.upsertProject(project);
    selectProject(project.id);
    return project.id;
}

bool NotesStore::updateProject(const QString &id, const QString &name, const QString &color, const QString &description)
{
    Project project = m_repo.projectById(id);
    if (project.id.isEmpty())
        return false;
    project.name = name.trimmed();
    project.color = color;
    project.description = description.trimmed();
    project.updatedAt = nowMs();
    m_repo.upsertProject(project);
    reload();
    return true;
}

QString NotesStore::deleteProject(const QString &id)
{
    const QVector<Project> live = m_repo.projects(false);
    if (live.size() <= 1)
        return QStringLiteral("至少需要保留一个项目！");
    Project project = m_repo.projectById(id);
    if (project.id.isEmpty())
        return QStringLiteral("未找到项目");
    const qint64 now = nowMs();
    const QVector<Note> notes = m_repo.notes(true);
    for (Note note : notes) {
        if (note.projectId != id || note.deletedAt > 0)
            continue;
        mirrorDelete(note);
        note.content.clear();
        note.images.clear();
        note.tags.clear();
        note.deletedAt = now;
        note.updatedAt = now;
        m_repo.upsertNote(note);
    }
    project.deletedAt = now;
    project.updatedAt = now;
    m_repo.upsertProject(project);
    if (m_activeProjectId == id)
        m_activeProjectId.clear();
    reload();
    return {};
}

QVariantMap NotesStore::saveNote(const QVariantMap &data, const QString &commitMessage)
{
    const qint64 now = nowMs();
    Note note;
    const QString id = data.value(QStringLiteral("id")).toString();
    if (!id.isEmpty()) {
        note = m_repo.noteById(id);
        if (note.id.isEmpty())
            return {};
        const QString oldTitle = note.title;
        const QString oldProject = note.projectId;
        if (data.contains(QStringLiteral("projectId")))
            note.projectId = data.value(QStringLiteral("projectId")).toString();
        if (data.contains(QStringLiteral("title")))
            note.title = data.value(QStringLiteral("title")).toString();
        if (data.contains(QStringLiteral("content")))
            note.content = data.value(QStringLiteral("content")).toString();
        if (data.contains(QStringLiteral("pinned")))
            note.pinned = data.value(QStringLiteral("pinned")).toBool();
        if (data.contains(QStringLiteral("images"))) {
            note.images.clear();
            for (const QVariant &image : data.value(QStringLiteral("images")).toList())
                note.images.append(image.toString());
        }
        note.updatedAt = now;
        if (oldTitle != note.title || oldProject != note.projectId) {
            const Project previous = m_repo.projectById(oldProject);
            deleteNoteFile(m_vault, oldTitle, previous.name);
        }
    } else {
        note.id = makeId(QStringLiteral("note-"));
        note.projectId = data.value(QStringLiteral("projectId")).toString();
        if (note.projectId.isEmpty())
            note.projectId = m_activeProjectId;
        note.title = data.value(QStringLiteral("title")).toString();
        if (note.title.trimmed().isEmpty())
            note.title = QStringLiteral("无标题便签");
        note.content = data.value(QStringLiteral("content")).toString();
        note.pinned = data.value(QStringLiteral("pinned")).toBool();
        for (const QVariant &image : data.value(QStringLiteral("images")).toList())
            note.images.append(image.toString());
        note.createdAt = now;
        note.updatedAt = now;
    }
    if (note.title.trimmed().isEmpty())
        note.title = QStringLiteral("无标题便签");
    m_repo.upsertNote(note);

    const QVector<NoteHistory> previous = m_repo.histories(note.id);
    int version = 1;
    for (const NoteHistory &history : previous)
        version = qMax(version, history.version + 1);
    NoteHistory history;
    history.id = makeId(QStringLiteral("hist-"));
    history.noteId = note.id;
    history.version = version;
    history.commitMessage = commitMessage.trimmed().isEmpty()
        ? (id.isEmpty() ? QStringLiteral("初始创建便签") : QStringLiteral("更新便签内容"))
        : commitMessage.trimmed();
    history.title = note.title;
    history.content = note.content;
    history.timestamp = now;
    history.charCount = note.content.size();
    m_repo.addHistory(history);
    if (m_vault.autoExportOnSave)
        mirror(note);
    reload();
    return presentNote(note);
}

bool NotesStore::deleteNote(const QString &id)
{
    Note note = m_repo.noteById(id);
    if (note.id.isEmpty() || note.deletedAt > 0)
        return false;
    mirrorDelete(note);
    const qint64 now = nowMs();
    note.content.clear();
    note.images.clear();
    note.tags.clear();
    note.deletedAt = now;
    note.updatedAt = now;
    m_repo.upsertNote(note);
    reload();
    return true;
}

QVariantMap NotesStore::togglePin(const QString &id)
{
    Note note = m_repo.noteById(id);
    if (note.id.isEmpty())
        return {};
    note.pinned = !note.pinned;
    m_repo.upsertNote(note);
    reload();
    return presentNote(m_repo.noteById(id));
}

QVariantMap NotesStore::duplicateNote(const QString &id)
{
    const Note note = m_repo.noteById(id);
    if (note.id.isEmpty())
        return {};
    const qint64 now = nowMs();
    Note copy = note;
    copy.id = makeId(QStringLiteral("note-"));
    copy.title = (note.title.isEmpty() ? QStringLiteral("无标题便签") : note.title) + QStringLiteral(" (副本)");
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.deletedAt = 0;
    m_repo.upsertNote(copy);
    const QVector<NoteHistory> histories = m_repo.histories(note.id);
    if (histories.isEmpty()) {
        NoteHistory history;
        history.id = makeId(QStringLiteral("hist-"));
        history.noteId = copy.id;
        history.version = 1;
        history.commitMessage = QStringLiteral("复制便签初始版本");
        history.title = copy.title;
        history.content = copy.content;
        history.timestamp = now;
        history.charCount = copy.content.size();
        m_repo.addHistory(history);
    } else {
        QVector<NoteHistory> ordered = histories;
        std::sort(ordered.begin(), ordered.end(), [](const NoteHistory &a, const NoteHistory &b) { return a.version < b.version; });
        for (NoteHistory history : ordered) {
            history.id = makeId(QStringLiteral("hist-"));
            history.noteId = copy.id;
            m_repo.addHistory(history);
        }
    }
    reload();
    return presentNote(copy);
}

QVariantMap NotesStore::restoreVersion(const QString &historyId)
{
    NoteHistory selected;
    const QVector<NoteHistory> all = m_repo.allHistories();
    for (const NoteHistory &history : all) {
        if (history.id == historyId) {
            selected = history;
            break;
        }
    }
    if (selected.id.isEmpty())
        return {};
    Note note = m_repo.noteById(selected.noteId);
    if (note.id.isEmpty())
        return {};
    note.title = selected.title;
    note.content = selected.content;
    note.updatedAt = nowMs();
    m_repo.upsertNote(note);
    QStringList newer;
    for (const NoteHistory &history : m_repo.histories(note.id)) {
        if (history.version > selected.version)
            newer.append(history.id);
    }
    m_repo.deleteHistories(newer);
    if (m_vault.autoExportOnSave)
        mirror(note);
    reload();
    return presentNote(note);
}

QString NotesStore::cacheDataUrl(const QString &dataUrl) const
{
    if (dataUrl.startsWith(QLatin1String("file:")))
        return dataUrl;
    if (!dataUrl.startsWith(QLatin1String("data:image")))
        return {};
    const int comma = dataUrl.indexOf(QLatin1Char(','));
    if (comma < 0)
        return {};
    const QByteArray bytes = QByteArray::fromBase64(dataUrl.mid(comma + 1).toLatin1());
    const QString hash = QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Md5).toHex());
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation) + QStringLiteral("/images");
    QDir().mkpath(dir);
    const QString path = dir + QLatin1Char('/') + hash + QStringLiteral(".img");
    if (!QFile::exists(path)) {
        QFile file(path);
        if (file.open(QIODevice::WriteOnly))
            file.write(bytes);
    }
    return QUrl::fromLocalFile(path).toString();
}

QVariantMap NotesStore::presentNote(const Note &note) const
{
    QVariantMap map = note.toMap();
    QStringList paths;
    for (const QString &image : note.images) {
        const QString path = cacheDataUrl(image);
        if (!path.isEmpty())
            paths.append(path);
    }
    map.insert(QStringLiteral("imagePaths"), paths);
    map.insert(QStringLiteral("snippet"), plainTextSnippet(note.content, 110));
    map.insert(QStringLiteral("referenceCount"), static_cast<int>(extractReferences(note.content).size()));
    return map;
}

QVariantMap NotesStore::noteById(const QString &id) const
{
    const Note note = m_repo.noteById(id);
    if (note.id.isEmpty() || note.deletedAt > 0)
        return {};
    return presentNote(note);
}

QVariantMap NotesStore::projectById(const QString &id) const
{
    return m_repo.projectById(id).toMap();
}

Project NotesStore::findProject(const QString &id) const
{
    return m_repo.projectById(id);
}

QVariantList NotesStore::histories(const QString &noteId) const
{
    QVariantList rows;
    for (const NoteHistory &history : m_repo.histories(noteId))
        rows.append(history.toMap());
    return rows;
}

QVariantList NotesStore::backlinks(const QString &noteId) const
{
    QVariantList rows;
    for (const Note &note : m_liveNotes) {
        if (note.id == noteId)
            continue;
        const auto refs = extractReferences(note.content);
        for (const auto &ref : refs) {
            if (ref.first == noteId) {
                rows.append(presentNote(note));
                break;
            }
        }
    }
    return rows;
}

QVariantMap NotesStore::diff(const QString &oldText, const QString &newText) const
{
    return computeLineDiff(oldText, newText).toMap();
}

QString NotesStore::snippet(const QString &markdown, int maxLength) const
{
    return plainTextSnippet(markdown, maxLength);
}

int NotesStore::referenceCount(const QString &markdown) const
{
    return static_cast<int>(extractReferences(markdown).size());
}

QString NotesStore::markdownHtml(const QString &markdown) const
{
    return markdownToHtml(markdown, m_primary, m_dark);
}

QString NotesStore::formatTime(qint64 ms, bool withYear) const
{
    const QDateTime date = QDateTime::fromMSecsSinceEpoch(ms);
    return QLocale(QLocale::Chinese).toString(date, withYear ? QStringLiteral("yyyy/MM/dd HH:mm") : QStringLiteral("MM/dd HH:mm"));
}

QVariantList NotesStore::themePresets() const
{
    QVariantList rows;
    for (const Preset &preset : kPresets) {
        rows.append(QVariantMap{
            {QStringLiteral("id"), QString::fromUtf8(preset.id)},
            {QStringLiteral("name"), QString::fromUtf8(preset.name)},
            {QStringLiteral("color"), QString::fromUtf8(preset.color)},
        });
    }
    return rows;
}

void NotesStore::setThemeMode(const QString &mode)
{
    m_mode = mode;
    applySystemDark();
    saveSettings();
    emit themeChanged();
}

void NotesStore::setPreset(const QString &presetId)
{
    for (const Preset &preset : kPresets) {
        if (preset.id == presetId) {
            m_presetId = presetId;
            m_primary = QString::fromUtf8(preset.color);
            saveSettings();
            emit themeChanged();
            return;
        }
    }
}

void NotesStore::setPrimaryColor(const QString &color)
{
    m_primary = color;
    m_presetId = QStringLiteral("custom");
    saveSettings();
    emit themeChanged();
}

void NotesStore::toggleDarkMode()
{
    setThemeMode(m_dark ? QStringLiteral("light") : QStringLiteral("dark"));
}

QVariantMap NotesStore::applyLinePrefix(const QString &text, int start, int end, const QString &prefix) const
{
    return ::applyLinePrefix(text, start, end, prefix);
}

QVariantMap NotesStore::wrapSelection(const QString &text, int start, int end, const QString &tag, const QString &placeholder) const
{
    return ::wrapSelection(text, start, end, tag, placeholder);
}

QVariantMap NotesStore::smartEnter(const QString &text, int cursor) const
{
    return ::smartEnter(text, cursor);
}

QVariantMap NotesStore::insertIndent(const QString &text, int cursor) const
{
    return ::insertIndent(text, cursor);
}

QString NotesStore::pickMarkdownFile()
{
    return QFileDialog::getOpenFileName(nullptr, QStringLiteral("导入 Markdown"), QString(),
                                        QStringLiteral("Markdown (*.md *.markdown *.txt)"));
}

QString NotesStore::readTextFile(const QString &path) const
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        return {};
    return QString::fromUtf8(file.readAll());
}

QVariantMap NotesStore::importMarkdownPath(const QString &path)
{
    const QFileInfo info(path);
    if (!info.exists())
        return {};
    if (!info.suffix().toLower().contains(QLatin1String("md")) && info.suffix().toLower() != QLatin1String("txt")
        && info.suffix().toLower() != QLatin1String("markdown")) {
        return {{QStringLiteral("error"), QStringLiteral("格式不支持：仅允许导入 Markdown (.md) 或纯文本 (.txt) 文件")}};
    }
    const ParsedImport parsed = parseImportedMarkdown(info.fileName(), readTextFile(path));
    return saveNote(QVariantMap{
                        {QStringLiteral("projectId"), m_activeProjectId},
                        {QStringLiteral("title"), parsed.title},
                        {QStringLiteral("content"), parsed.content},
                        {QStringLiteral("images"), parsed.images},
                        {QStringLiteral("pinned"), false},
                    },
                    QStringLiteral("📥 从文件导入「%1」").arg(info.fileName()));
}

bool NotesStore::saveTextFile(const QString &suggestedName, const QString &content)
{
    QString name = sanitizeFilename(suggestedName);
    if (!name.endsWith(QLatin1String(".md"), Qt::CaseInsensitive))
        name += QStringLiteral(".md");
    const QString path = QFileDialog::getSaveFileName(nullptr, QStringLiteral("保存 Markdown"), name,
                                                      QStringLiteral("Markdown (*.md)"));
    if (path.isEmpty())
        return false;
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;
    file.write(content.toUtf8());
    return true;
}

QString NotesStore::renderCard(const QString &noteId)
{
    const Note note = m_repo.noteById(noteId);
    if (note.id.isEmpty())
        return {};
    const Project project = findProject(note.projectId);
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    QDir().mkpath(dir);
    const QString path = dir + QStringLiteral("/card-%1.png").arg(note.id);
    const Project *ptr = project.id.isEmpty() ? nullptr : &project;
    return renderNoteCardPng(note, ptr, path);
}

bool NotesStore::saveImageFile(const QString &suggestedName, const QString &imagePath)
{
    QString name = sanitizeFilename(suggestedName);
    if (!name.endsWith(QLatin1String(".png"), Qt::CaseInsensitive))
        name += QStringLiteral(".png");
    const QString path = QFileDialog::getSaveFileName(nullptr, QStringLiteral("保存卡片图片"), name,
                                                      QStringLiteral("PNG (*.png)"));
    if (path.isEmpty())
        return false;
    const QString source = QUrl(imagePath).isLocalFile() ? QUrl(imagePath).toLocalFile() : imagePath;
    if (QFile::exists(path))
        QFile::remove(path);
    return QFile::copy(source, path);
}

void NotesStore::copyText(const QString &text) const
{
    QGuiApplication::clipboard()->setText(text);
}

QStringList NotesStore::pickImages()
{
    const QStringList files = QFileDialog::getOpenFileNames(nullptr, QStringLiteral("添加图片"), QString(),
                                                            QStringLiteral("图片 (*.png *.jpg *.jpeg *.gif *.webp *.bmp)"));
    QStringList urls;
    for (const QString &file : files) {
        QImage image(file);
        if (image.isNull())
            continue;
        QByteArray bytes;
        QBuffer buffer(&bytes);
        buffer.open(QIODevice::WriteOnly);
        image.save(&buffer, "PNG");
        urls.append(QStringLiteral("data:image/png;base64,") + QString::fromLatin1(bytes.toBase64()));
    }
    return urls;
}

QString NotesStore::cacheImage(const QString &dataUrl) const
{
    return cacheDataUrl(dataUrl);
}

QString NotesStore::clipboardImage()
{
    const QImage image = QGuiApplication::clipboard()->image();
    if (image.isNull())
        return {};
    QByteArray bytes;
    QBuffer buffer(&bytes);
    buffer.open(QIODevice::WriteOnly);
    image.save(&buffer, "PNG");
    return QStringLiteral("data:image/png;base64,") + QString::fromLatin1(bytes.toBase64());
}

QString NotesStore::pin() const { return m_sync.pin(); }
QStringList NotesStore::serverIps() const { return m_sync.localIpv4(); }
void NotesStore::setSelectedIp(const QString &ip)
{
    m_selectedIp = ip;
    saveSettings();
    emit syncChanged();
}
QString NotesStore::pairingUrl() const
{
    if (m_selectedIp.isEmpty())
        return {};
    return QStringLiteral("projectnotes://sync?ip=%1&port=%2&pin=%3").arg(m_selectedIp).arg(syncPort()).arg(pin());
}
bool NotesStore::hasIncoming() const { return m_sync.hasIncoming(); }
QVariantMap NotesStore::incomingSync() const { return m_sync.incomingSummary(); }
QVariantList NotesStore::connectedDevices() const { return m_sync.connectedDevices(); }
bool NotesStore::syncBusy() const { return m_sync.busy(); }
bool NotesStore::hasUndo() const { return m_sync.hasUndo(); }

bool NotesStore::setPin(const QString &pin)
{
    if (!QRegularExpression(QStringLiteral("^\\d{6}$")).match(pin).hasMatch())
        return false;
    m_sync.setPin(pin);
    m_settings->setValue(QStringLiteral("sync/pin"), pin);
    emit syncChanged();
    return true;
}

void NotesStore::acceptSync() { m_sync.acceptIncoming(); }
void NotesStore::rejectSync() { m_sync.rejectIncoming(QStringLiteral("本端用户拒绝了同步请求")); }
void NotesStore::dismissReport()
{
    m_hasReport = false;
    m_report.clear();
    emit syncChanged();
}
bool NotesStore::undoSync()
{
    const bool ok = m_sync.undo();
    if (ok)
        reload();
    emit syncChanged();
    return ok;
}
bool NotesStore::triggerSync(const QString &deviceId, const QString &mode)
{
    return m_sync.triggerMobile(deviceId, mode, noteCount(), projectCount());
}
void NotesStore::syncTo(const QString &address, const QString &pin, const QString &mode)
{
    m_settings->setValue(QStringLiteral("sync/lastAddress"), address);
    m_settings->setValue(QStringLiteral("sync/lastPin"), pin);
    m_sync.syncWithServer(address, pin, mode);
    emit syncChanged();
}
QString NotesStore::copySelectedEndpoint()
{
    const QString text = QStringLiteral("%1:%2").arg(m_selectedIp).arg(syncPort());
    copyText(text);
    return text;
}

bool NotesStore::pickVaultFolder()
{
    const QString path = QFileDialog::getExistingDirectory(nullptr, QStringLiteral("选择外部存储笔记文件夹"), m_vault.folderPath);
    if (path.isEmpty())
        return false;
    m_vault.folderPath = path;
    m_vault.enabled = true;
    saveSettings();
    m_vaultMessage = QStringLiteral("外部存储路径已设为：%1").arg(path);
    emit vaultChanged();
    return true;
}

void NotesStore::setVaultEnabled(bool enabled)
{
    m_vault.enabled = enabled;
    saveSettings();
    emit vaultChanged();
}

void NotesStore::setAutoExport(bool enabled)
{
    m_vault.autoExportOnSave = enabled;
    saveSettings();
    emit vaultChanged();
}

int NotesStore::exportVault()
{
    const int count = exportAllNotes(m_vault, m_repo.projects(false), m_repo.notes(false));
    m_vaultMessage = QStringLiteral("已写入 %1 篇便签到 %2").arg(count).arg(m_vault.folderPath);
    emit vaultChanged();
    return count;
}

void NotesStore::clearVaultMessage()
{
    m_vaultMessage.clear();
    emit vaultChanged();
}

void NotesStore::mirror(const Note &note)
{
    if (!m_vault.autoExportOnSave && !m_vault.enabled)
        return;
    const Project project = findProject(note.projectId);
    const Project *ptr = project.id.isEmpty() ? nullptr : &project;
    writeNoteFile(m_vault, note, ptr);
}

void NotesStore::mirrorDelete(const Note &note)
{
    const Project project = findProject(note.projectId);
    deleteNoteFile(m_vault, note.title, project.name.isEmpty() ? QStringLiteral("默认项目") : project.name);
}
