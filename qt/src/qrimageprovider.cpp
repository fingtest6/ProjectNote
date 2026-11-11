#include "qrimageprovider.h"

#include <QPainter>
#include <QUrl>
#include <qrencode.h>

QrImageProvider::QrImageProvider()
    : QQuickImageProvider(QQuickImageProvider::Image)
{
}

QImage QrImageProvider::requestImage(const QString &id, QSize *size, const QSize &requestedSize)
{
    QString text = QUrl::fromPercentEncoding(id.toUtf8());
    if (text.contains(QLatin1Char('%')))
        text = QUrl::fromPercentEncoding(text.toUtf8());
    QImage image(220, 220, QImage::Format_RGB32);
    image.fill(Qt::white);
    QRcode *code = QRcode_encodeString(text.toUtf8().constData(), 0, QR_ECLEVEL_M, QR_MODE_8, 1);
    if (!code) {
        if (size)
            *size = image.size();
        return image;
    }
    const int margin = 2;
    const int modules = code->width;
    const int dim = modules + margin * 2;
    const int pixel = qMax(1, (requestedSize.width() > 0 ? requestedSize.width() : 220) / dim);
    image = QImage(dim * pixel, dim * pixel, QImage::Format_RGB32);
    image.fill(Qt::white);
    QPainter painter(&image);
    painter.setPen(Qt::NoPen);
    painter.setBrush(Qt::black);
    for (int y = 0; y < modules; ++y) {
        for (int x = 0; x < modules; ++x) {
            if (code->data[y * modules + x] & 1)
                painter.drawRect((x + margin) * pixel, (y + margin) * pixel, pixel, pixel);
        }
    }
    painter.end();
    QRcode_free(code);
    if (size)
        *size = image.size();
    return image;
}
