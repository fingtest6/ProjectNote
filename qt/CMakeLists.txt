cmake_minimum_required(VERSION 3.16)

project(ProjectNote VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Qml Quick QuickControls2 Sql Network)
find_package(PkgConfig REQUIRED)
pkg_check_modules(QRENCODE REQUIRED libqrencode)

qt_add_executable(projectnote
    src/main.cpp
    src/models.cpp
    src/database.cpp
    src/markdown.cpp
    src/diffengine.cpp
    src/vault.cpp
    src/syncservice.cpp
    src/notesstore.cpp
    src/cardimage.cpp
    src/qrimageprovider.cpp
    src/selftest.cpp
    resources.qrc
)

qt_add_qml_module(projectnote
    URI ProjectNote
    VERSION 1.0
    RESOURCE_PREFIX /qt/qml
    NO_LINT
    QML_FILES
        qml/Main.qml
        qml/NoteCard.qml
        qml/ProjectDrawer.qml
        qml/NoteEditor.qml
        qml/NoteDetail.qml
        qml/GitDiffDialog.qml
        qml/ExportDialog.qml
        qml/ThemeDialog.qml
        qml/SyncDialog.qml
        qml/SyncConfirmDialog.qml
        qml/SyncReportDialog.qml
        qml/ReferencePicker.qml
)

target_include_directories(projectnote PRIVATE src ${QRENCODE_INCLUDE_DIRS})
target_link_libraries(projectnote PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Sql
    Qt6::Network
    ${QRENCODE_LIBRARIES}
)

if(WIN32)
    enable_language(RC)
    target_sources(projectnote PRIVATE packaging/projectnote.rc)
endif()

install(TARGETS projectnote RUNTIME DESTINATION bin)
install(FILES packaging/projectnote.desktop DESTINATION share/applications)
install(FILES resources/icon-256.png DESTINATION share/icons/hicolor/256x256/apps RENAME projectnote.png)
install(FILES resources/icon-512.png DESTINATION share/icons/hicolor/512x512/apps RENAME projectnote.png)
install(FILES packaging/projectnote.icns DESTINATION share/icons OPTIONAL)

set(CPACK_PACKAGE_NAME "projectnote")
set(CPACK_PACKAGE_VENDOR "rduteam")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "项目便签")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_GENERATOR "TGZ")
include(CPack)
