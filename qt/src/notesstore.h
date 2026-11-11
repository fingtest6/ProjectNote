#pragma once

#include "database.h"
#include "models.h"
#include "syncservice.h"
#include "vault.h"

#include <QObject>
#include <QVariantMap>

#include <memory>

class QSettings;

class QQuickWindow;

class NotesStore : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString bgColor READ bgColor NOTIFY themeChanged)
    Q_PROPERTY(QString surfaceColor READ surfaceColor NOTIFY themeChanged)
    Q_PROPERTY(QString headerColor READ headerColor NOTIFY themeChanged)
    Q_PROPERTY(QString textColor READ textColor NOTIFY themeChanged)
    Q_PROPERTY(QString secondaryColor READ secondaryColor NOTIFY themeChanged)
    Q_PROPERTY(QString mutedColor READ mutedColor NOTIFY themeChanged)
    Q_PROPERTY(QString faintColor READ faintColor NOTIFY themeChanged)
    Q_PROPERTY(QString borderColor READ borderColor NOTIFY themeChanged)
    Q_PROPERTY(QString chipColor READ chipColor NOTIFY themeChanged)
    Q_PROPERTY(QString inputColor READ inputColor NOTIFY themeChanged)
    Q_PROPERTY(QString primaryColor READ primaryColor NOTIFY themeChanged)
    Q_PROPERTY(QString primarySoft READ primarySoft NOTIFY themeChanged)
    Q_PROPERTY(QString primaryText READ primaryText NOTIFY themeChanged)
    Q_PROPERTY(bool dark READ dark NOTIFY themeChanged)
    Q_PROPERTY(QString themeMode READ themeMode NOTIFY themeChanged)
    Q_PROPERTY(QString presetId READ presetId NOTIFY themeChanged)
    Q_PROPERTY(QString activeProjectId READ activeProjectId NOTIFY activeProjectChanged)
    Q_PROPERTY(QVariantMap activeProject READ activeProject NOTIFY activeProjectChanged)
    Q_PROPERTY(QString searchQuery READ searchQuery WRITE setSearchQuery NOTIFY searchChanged)
    Q_PROPERTY(bool searchOpen READ searchOpen NOTIFY searchChanged)
    Q_PROPERTY(bool globalSearch READ globalSearch NOTIFY searchChanged)
    Q_PROPERTY(int visibleCount READ visibleCount NOTIFY notesChanged)
    Q_PROPERTY(int projectCount READ projectCount NOTIFY notesChanged)
    Q_PROPERTY(int noteCount READ noteCount NOTIFY notesChanged)
    Q_PROPERTY(QVariantMap projectNoteCounts READ projectNoteCounts NOTIFY notesChanged)
    Q_PROPERTY(QObject *visibleNotes READ visibleNotes CONSTANT)
    Q_PROPERTY(QObject *projects READ projects CONSTANT)
    Q_PROPERTY(QString pin READ pin NOTIFY syncChanged)
    Q_PROPERTY(QStringList serverIps READ serverIps NOTIFY syncChanged)
    Q_PROPERTY(QString selectedIp READ selectedIp WRITE setSelectedIp NOTIFY syncChanged)
    Q_PROPERTY(int syncPort READ syncPort CONSTANT)
    Q_PROPERTY(QString pairingUrl READ pairingUrl NOTIFY syncChanged)
    Q_PROPERTY(QString deviceName READ deviceName NOTIFY syncChanged)
    Q_PROPERTY(bool hasIncoming READ hasIncoming NOTIFY syncChanged)
    Q_PROPERTY(QVariantMap incomingSync READ incomingSync NOTIFY syncChanged)
    Q_PROPERTY(QVariantList connectedDevices READ connectedDevices NOTIFY syncChanged)
    Q_PROPERTY(bool syncBusy READ syncBusy NOTIFY syncChanged)
    Q_PROPERTY(QVariantMap syncReport READ syncReport NOTIFY syncChanged)
    Q_PROPERTY(bool hasSyncReport READ hasSyncReport NOTIFY syncChanged)
    Q_PROPERTY(bool hasUndo READ hasUndo NOTIFY syncChanged)
    Q_PROPERTY(QString lastSyncText READ lastSyncText NOTIFY syncChanged)
    Q_PROPERTY(QString vaultPath READ vaultPath NOTIFY vaultChanged)
    Q_PROPERTY(bool vaultEnabled READ vaultEnabled NOTIFY vaultChanged)
    Q_PROPERTY(bool autoExport READ autoExport NOTIFY vaultChanged)
    Q_PROPERTY(QString vaultMessage READ vaultMessage NOTIFY vaultChanged)

public:
    explicit NotesStore(QObject *parent = nullptr);
    ~NotesStore() override;
    bool openDefault();
    bool openAt(const QString &path, bool seed);

    QString bgColor() const;
    QString surfaceColor() const;
    QString headerColor() const;
    QString textColor() const;
    QString secondaryColor() const;
    QString mutedColor() const;
    QString faintColor() const;
    QString borderColor() const;
    QString chipColor() const;
    QString inputColor() const;
    QString primaryColor() const { return m_primary; }
    QString primarySoft() const;
    QString primaryText() const { return QStringLiteral("#ffffff"); }
    bool dark() const { return m_dark; }
    QString themeMode() const { return m_mode; }
    QString presetId() const { return m_presetId; }

    QString activeProjectId() const { return m_activeProjectId; }
    QVariantMap activeProject() const;
    QString searchQuery() const { return m_search; }
    void setSearchQuery(const QString &query);
    bool searchOpen() const { return m_searchOpen; }
    bool globalSearch() const { return m_globalSearch; }
    int visibleCount() const { return m_visible->count(); }
    int projectCount() const { return m_projects->count(); }
    int noteCount() const;
    QVariantMap projectNoteCounts() const { return m_counts; }
    QObject *visibleNotes() const { return m_visible; }
    QObject *projects() const { return m_projects; }

    QString pin() const;
    QStringList serverIps() const;
    QString selectedIp() const { return m_selectedIp; }
    void setSelectedIp(const QString &ip);
    int syncPort() const { return 25860; }
    QString pairingUrl() const;
    QString deviceName() const { return m_deviceName; }
    bool hasIncoming() const;
    QVariantMap incomingSync() const;
    QVariantList connectedDevices() const;
    bool syncBusy() const;
    QVariantMap syncReport() const { return m_report; }
    bool hasSyncReport() const { return m_hasReport; }
    bool hasUndo() const;
    QString lastSyncText() const { return m_lastSyncText; }

    QString vaultPath() const { return m_vault.folderPath; }
    bool vaultEnabled() const { return m_vault.enabled; }
    bool autoExport() const { return m_vault.autoExportOnSave; }
    QString vaultMessage() const { return m_vaultMessage; }

    void setWindow(QQuickWindow *window);

    Q_INVOKABLE void toggleSearch();
    Q_INVOKABLE void toggleGlobalSearch();
    Q_INVOKABLE void selectProject(const QString &id);
    Q_INVOKABLE QString createProject(const QString &name, const QString &color, const QString &description);
    Q_INVOKABLE bool updateProject(const QString &id, const QString &name, const QString &color, const QString &description);
    Q_INVOKABLE QString deleteProject(const QString &id);
    Q_INVOKABLE QVariantMap saveNote(const QVariantMap &data, const QString &commitMessage);
    Q_INVOKABLE bool deleteNote(const QString &id);
    Q_INVOKABLE QVariantMap togglePin(const QString &id);
    Q_INVOKABLE QVariantMap duplicateNote(const QString &id);
    Q_INVOKABLE QVariantMap restoreVersion(const QString &historyId);
    Q_INVOKABLE QVariantMap noteById(const QString &id) const;
    Q_INVOKABLE QVariantMap projectById(const QString &id) const;
    Q_INVOKABLE QVariantList histories(const QString &noteId) const;
    Q_INVOKABLE QVariantList backlinks(const QString &noteId) const;
    Q_INVOKABLE QVariantMap diff(const QString &oldText, const QString &newText) const;
    Q_INVOKABLE QString snippet(const QString &markdown, int maxLength) const;
    Q_INVOKABLE int referenceCount(const QString &markdown) const;
    Q_INVOKABLE QString markdownHtml(const QString &markdown) const;
    Q_INVOKABLE QString formatTime(qint64 ms, bool withYear) const;
    Q_INVOKABLE QVariantList themePresets() const;
    Q_INVOKABLE void setThemeMode(const QString &mode);
    Q_INVOKABLE void setPreset(const QString &presetId);
    Q_INVOKABLE void setPrimaryColor(const QString &color);
    Q_INVOKABLE void toggleDarkMode();
    Q_INVOKABLE QVariantMap applyLinePrefix(const QString &text, int start, int end, const QString &prefix) const;
    Q_INVOKABLE QVariantMap wrapSelection(const QString &text, int start, int end, const QString &tag, const QString &placeholder) const;
    Q_INVOKABLE QVariantMap smartEnter(const QString &text, int cursor) const;
    Q_INVOKABLE QVariantMap insertIndent(const QString &text, int cursor) const;
    Q_INVOKABLE QString pickMarkdownFile();
    Q_INVOKABLE QString readTextFile(const QString &path) const;
    Q_INVOKABLE QVariantMap importMarkdownPath(const QString &path);
    Q_INVOKABLE bool saveTextFile(const QString &suggestedName, const QString &content);
    Q_INVOKABLE QString renderCard(const QString &noteId);
    Q_INVOKABLE bool saveImageFile(const QString &suggestedName, const QString &imagePath);
    Q_INVOKABLE void copyText(const QString &text) const;
    Q_INVOKABLE QStringList pickImages();
    Q_INVOKABLE QString clipboardImage();
    Q_INVOKABLE QString cacheImage(const QString &dataUrl) const;
    Q_INVOKABLE bool setPin(const QString &pin);
    Q_INVOKABLE void acceptSync();
    Q_INVOKABLE void rejectSync();
    Q_INVOKABLE void dismissReport();
    Q_INVOKABLE bool undoSync();
    Q_INVOKABLE bool triggerSync(const QString &deviceId, const QString &mode);
    Q_INVOKABLE void syncTo(const QString &address, const QString &pin, const QString &mode);
    Q_INVOKABLE QString copySelectedEndpoint();
    Q_INVOKABLE bool pickVaultFolder();
    Q_INVOKABLE void setVaultEnabled(bool enabled);
    Q_INVOKABLE void setAutoExport(bool enabled);
    Q_INVOKABLE int exportVault();
    Q_INVOKABLE void clearVaultMessage();

signals:
    void themeChanged();
    void activeProjectChanged();
    void searchChanged();
    void notesChanged();
    void syncChanged();
    void vaultChanged();

private:
    void reload();
    void reconcileActiveProject();
    void loadSettings();
    void saveSettings();
    void applySystemDark();
    QString cacheDataUrl(const QString &dataUrl) const;
    QVariantMap presentNote(const Note &note) const;
    void mirror(const Note &note);
    void mirrorDelete(const Note &note);
    Project findProject(const QString &id) const;

    Repository m_repo;
    SyncService m_sync;
    VariantListModel *m_visible = nullptr;
    VariantListModel *m_projects = nullptr;
    std::unique_ptr<QSettings> m_settings;
    QString m_activeProjectId;
    QString m_search;
    bool m_searchOpen = false;
    bool m_globalSearch = false;
    QVariantMap m_counts;
    QString m_mode = QStringLiteral("system");
    QString m_presetId = QStringLiteral("emerald");
    QString m_primary = QStringLiteral("#10b981");
    bool m_dark = false;
    bool m_systemDark = false;
    QString m_deviceId;
    QString m_deviceName;
    QString m_selectedIp;
    VaultConfig m_vault;
    QString m_vaultMessage;
    QVariantMap m_report;
    bool m_hasReport = false;
    QString m_lastSyncText;
    QQuickWindow *m_window = nullptr;
    QVector<Note> m_liveNotes;
};
