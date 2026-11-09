package com.nikcirri.lupus;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Aggiornamento dentro l'app: scarica l'APK della nuova versione da GitHub e apre l'installazione di Android.
 * Accetta solo gli indirizzi delle Release di Lupus. Il file va nella cache dell'app (una sola copia,
 * sostituita a ogni aggiornamento): "Svuota cache" nelle impostazioni di Android lo cancella.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    static final String ALLOWED_PREFIX = "https://github.com/Nikcirri/lupus/releases/download/";
    private static final String APK_NAME = "Lupus-aggiornamento.apk";
    private static final long MIN_APK_BYTES = 300_000L;
    private static final long MAX_APK_BYTES = 100_000_000L;
    private static final int MAX_REDIRECTS = 5;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    /** Android permette a Lupus di installare aggiornamenti? (Impostazione "Installa app sconosciute"). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    /** Apre l'impostazione "Installa app sconosciute" di Lupus. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Non riesco ad aprire le impostazioni: " + e.getMessage());
        }
    }

    /** Scarica l'APK (avvisando l'avanzamento con l'evento "progress") e apre l'installazione. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED_PREFIX) || !url.endsWith(".apk") || url.contains("..")) {
            call.reject("Indirizzo dell'aggiornamento non valido");
            return;
        }
        if (downloading) {
            call.reject("Sto già scaricando l'aggiornamento");
            return;
        }
        downloading = true;
        executor.execute(() -> {
            try {
                File apk = download(url);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startActivity(intent);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Non riesco ad aprire l'installazione: " + e.getMessage());
                    }
                });
            } catch (Exception e) {
                call.reject("Download non riuscito: " + e.getMessage());
            } finally {
                downloading = false;
            }
        });
    }

    private File download(String address) throws IOException {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("cartella non disponibile");
        // Una sola copia: si cancella quella dell'aggiornamento precedente (e ogni avanzo).
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        File part = new File(dir, APK_NAME + ".part");
        File apk = new File(dir, APK_NAME);

        HttpURLConnection conn = null;
        try {
            // GitHub rimanda all'indirizzo vero del file: si seguono i passaggi, solo su https.
            URL url = new URL(address);
            boolean ok = false;
            for (int i = 0; i <= MAX_REDIRECTS; i++) {
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(30_000);
                conn.setRequestProperty("User-Agent", "Lupus-Android");
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = null;
                    if (location == null) throw new IOException("reindirizzamento senza indirizzo");
                    url = new URL(url, location);
                    if (!"https".equals(url.getProtocol())) throw new IOException("indirizzo non sicuro");
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + code);
                ok = true;
                break;
            }
            if (!ok || conn == null) throw new IOException("troppi reindirizzamenti");

            long total = conn.getContentLengthLong();
            if (total > MAX_APK_BYTES) throw new IOException("file troppo grande");
            long done = 0;
            int lastPercent = -1;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    out.write(buffer, 0, n);
                    done += n;
                    if (done > MAX_APK_BYTES) throw new IOException("file troppo grande");
                    if (total > 0) {
                        int percent = (int) Math.min(100, (done * 100) / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("progress", progress);
                        }
                    }
                }
            }
            // Android riconosce un'app solo da un file che finisce con .apk: prima si rinomina, poi si controlla.
            if (!part.renameTo(apk)) throw new IOException("non riesco a salvare il file");
            checkComplete(apk, total);
            return apk;
        } catch (IOException e) {
            part.delete();
            apk.delete();
            throw e;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Il file è arrivato tutto ed è davvero un APK di Lupus? */
    private void checkComplete(File file, long expected) throws IOException {
        long size = file.length();
        if (size < MIN_APK_BYTES || (expected > 0 && size != expected)) throw new IOException("file incompleto");
        byte[] head = new byte[4];
        try (InputStream in = new FileInputStream(file)) {
            if (in.read(head) != 4 || head[0] != 'P' || head[1] != 'K' || head[2] != 3 || head[3] != 4) {
                throw new IOException("il file non è un'app Android");
            }
        }
        PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(file.getPath(), 0);
        if (info == null || !getContext().getPackageName().equals(info.packageName)) {
            throw new IOException("il file non è un aggiornamento di Lupus");
        }
    }
}
