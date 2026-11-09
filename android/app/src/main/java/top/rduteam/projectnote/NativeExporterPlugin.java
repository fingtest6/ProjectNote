package top.rduteam.projectnote;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "NativeExporter")
public class NativeExporterPlugin extends Plugin {

    /**
     * Directly save PNG base64 image into Android's public Pictures folder (Pictures/ProjectNotes)
     * without popping up a Share sheet. Automatically indexes into system Gallery.
     */
    @PluginMethod
    public void saveImageToPictures(PluginCall call) {
        String filename = call.getString("filename", "note_card_" + System.currentTimeMillis() + ".png");
        String base64Data = call.getString("base64Data", "");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Empty image data");
            return;
        }

        if (!filename.toLowerCase().endsWith(".png")) {
            filename = filename + ".png";
        }

        try {
            String cleanBase64 = base64Data.contains(",")
                    ? base64Data.substring(base64Data.indexOf(",") + 1)
                    : base64Data;
            byte[] imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/ProjectNotes");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);

                Uri imageUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (imageUri == null) {
                    call.reject("Failed to create MediaStore entry");
                    return;
                }

                try (OutputStream os = resolver.openOutputStream(imageUri)) {
                    if (os == null) {
                        call.reject("Failed to open OutputStream");
                        return;
                    }
                    os.write(imageBytes);
                    os.flush();
                }

                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(imageUri, values, null, null);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", "Pictures/ProjectNotes/" + filename);
                ret.put("uri", imageUri.toString());
                call.resolve(ret);
            } else {
                File picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                File appDir = new File(picturesDir, "ProjectNotes");
                if (!appDir.exists()) {
                    appDir.mkdirs();
                }
                File outFile = new File(appDir, filename);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(imageBytes);
                    fos.flush();
                }

                MediaScannerConnection.scanFile(
                        getContext(),
                        new String[]{outFile.getAbsolutePath()},
                        new String[]{"image/png"},
                        null
                );

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", outFile.getAbsolutePath());
                ret.put("uri", Uri.fromFile(outFile).toString());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Failed to save image to Pictures: " + e.getMessage(), e);
        }
    }

    /**
     * Launch Android's native system file save interface (Storage Access Framework ACTION_CREATE_DOCUMENT)
     * so the user can choose where to save the .md file directly on the device.
     */
    @PluginMethod
    public void saveMarkdownFile(PluginCall call) {
        String filename = call.getString("filename", "便签.md");
        if (!filename.toLowerCase().endsWith(".md")) {
            filename = filename + ".md";
        }

        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/markdown");
            intent.putExtra(Intent.EXTRA_TITLE, filename);

            startActivityForResult(call, intent, "handleSaveMarkdownResult");
        } catch (Exception e) {
            // Fallback to text/plain if device doesn't recognize text/markdown MIME type
            try {
                Intent fallbackIntent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                fallbackIntent.addCategory(Intent.CATEGORY_OPENABLE);
                fallbackIntent.setType("text/plain");
                fallbackIntent.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(call, fallbackIntent, "handleSaveMarkdownResult");
            } catch (Exception ex) {
                call.reject("Unable to launch Android file save picker: " + ex.getMessage(), ex);
            }
        }
    }

    @ActivityCallback
    private void handleSaveMarkdownResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            if (uri == null) {
                call.reject("No file URI returned");
                return;
            }

            String content = call.getString("content", "");
            try (OutputStream os = getContext().getContentResolver().openOutputStream(uri)) {
                if (os == null) {
                    call.reject("Cannot open file output stream");
                    return;
                }
                os.write(content.getBytes(StandardCharsets.UTF_8));
                os.flush();

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("cancelled", false);
                ret.put("uri", uri.toString());
                ret.put("path", uri.getPath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to write Markdown file: " + e.getMessage(), e);
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("cancelled", true);
            call.resolve(ret);
        }
    }

    /**
     * Launch Android's native system file picker (Storage Access Framework ACTION_OPEN_DOCUMENT)
     * to select and read a local .md / .markdown / .txt file.
     */
    @PluginMethod
    public void pickMarkdownFile(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("text/*");
            String[] mimeTypes = new String[]{"text/plain", "text/markdown", "text/x-markdown", "application/octet-stream"};
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            startActivityForResult(call, intent, "handlePickMarkdownResult");
        } catch (Exception e) {
            call.reject("Unable to launch Android file picker: " + e.getMessage(), e);
        }
    }

    @ActivityCallback
    private void handlePickMarkdownResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            if (uri == null) {
                call.reject("No file URI returned");
                return;
            }

            ContentResolver resolver = getContext().getContentResolver();
            String filename = "导入便签.md";

            try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (nameIndex >= 0) {
                        String displayName = cursor.getString(nameIndex);
                        if (displayName != null && !displayName.isEmpty()) {
                            filename = displayName;
                        }
                    }
                }
            } catch (Exception ignored) {
            }

            // Strictly validate file extension: must be .md, .markdown, or .txt
            String lowerName = filename.toLowerCase();
            if (!lowerName.endsWith(".md") && !lowerName.endsWith(".markdown") && !lowerName.endsWith(".txt")) {
                call.reject("INVALID_FILE_TYPE: 仅支持导入 .md、.markdown 或 .txt 文档格式，已阻止非文本格式导入");
                return;
            }

            try (InputStream is = resolver.openInputStream(uri)) {
                if (is == null) {
                    call.reject("Cannot open file input stream");
                    return;
                }
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] data = new byte[4096];
                int nRead;
                while ((nRead = is.read(data, 0, data.length)) != -1) {
                    buffer.write(data, 0, nRead);
                }
                buffer.flush();
                String content = new String(buffer.toByteArray(), StandardCharsets.UTF_8);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("cancelled", false);
                ret.put("filename", filename);
                ret.put("content", content);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to read Markdown file: " + e.getMessage(), e);
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("cancelled", true);
            call.resolve(ret);
        }
    }
}
