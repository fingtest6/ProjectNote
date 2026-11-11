#include "notesstore.h"
#include "qrimageprovider.h"
#include "selftest.h"

#include <QFont>

#include <QApplication>
#include <QCommandLineParser>
#include <QGuiApplication>
#include <QIcon>
#include <QPalette>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>
#include <QTimer>

static QIcon appIcon()
{
    QIcon icon;
    const QStringList files = {
        QStringLiteral(":/icon-16.png"),
        QStringLiteral(":/icon-32.png"),
        QStringLiteral(":/icon-48.png"),
        QStringLiteral(":/icon-64.png"),
        QStringLiteral(":/icon-128.png"),
        QStringLiteral(":/icon-256.png"),
        QStringLiteral(":/icon-512.png"),
    };
    for (const QString &file : files)
        icon.addFile(file);
    return icon;
}

int main(int argc, char *argv[])
{
    qputenv("QT_QUICK_CONTROLS_STYLE", "Basic");
    QApplication app(argc, argv);
    QGuiApplication::setApplicationName(QStringLiteral("projectnote"));
    QGuiApplication::setApplicationDisplayName(QStringLiteral("项目便签"));
    QGuiApplication::setOrganizationName(QStringLiteral("rduteam"));
    QGuiApplication::setOrganizationDomain(QStringLiteral("top.rduteam.projectnote"));
    QGuiApplication::setApplicationVersion(QStringLiteral("1.0.0"));
    QGuiApplication::setDesktopFileName(QStringLiteral("projectnote"));
    QGuiApplication::setWindowIcon(appIcon());

    QFont font(QStringLiteral("Noto Sans CJK SC"));
    font.setPixelSize(14);
    app.setFont(font);

    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption({QStringLiteral("self-test"), QStringLiteral("Run the data-model self test and exit.")});
    parser.addOption({{QStringLiteral("screenshot"), QStringLiteral("Save a window screenshot and exit.")}, QStringLiteral("path"), QStringLiteral("path")});
    parser.process(app);
    if (parser.isSet(QStringLiteral("self-test")))
        return runSelfTest();

    NotesStore store;
    if (!store.openDefault())
        return 1;

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("store"), &store);
    engine.addImageProvider(QStringLiteral("qr"), new QrImageProvider);
    const QUrl url(QStringLiteral("qrc:/qt/qml/ProjectNote/qml/Main.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated, &app,
                     [&](QObject *object, const QUrl &) {
                         if (!object) {
                             QCoreApplication::exit(1);
                             return;
                         }
                         if (auto *window = qobject_cast<QQuickWindow *>(object)) {
                             window->setIcon(QGuiApplication::windowIcon());
                             store.setWindow(window);
                             if (parser.isSet(QStringLiteral("screenshot"))) {
                                 QTimer::singleShot(400, window, [window, &parser] {
                                     const QImage image = window->grabWindow();
                                     image.save(parser.value(QStringLiteral("screenshot")));
                                     QCoreApplication::exit(image.isNull() ? 1 : 0);
                                 });
                             }
                         }
                     },
                     Qt::QueuedConnection);
    engine.load(url);
    if (engine.rootObjects().isEmpty())
        return 1;
    return app.exec();
}
