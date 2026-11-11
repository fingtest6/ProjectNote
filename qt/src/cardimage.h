#pragma once

#include "models.h"

#include <QString>

QString renderNoteCardPng(const Note &note, const Project *project, const QString &destPath);
