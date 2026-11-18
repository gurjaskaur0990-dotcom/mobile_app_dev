package com.splittrip.react;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

final class ApkUpdate {
    private static final long MAX_BYTES = 256L * 1024 * 1024;
    private static final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private static final String APP_ID = ReleaseAsset.APP_ID;

    interface Progress { void report(Integer percent); }

    static void start(Activity activity, PluginCall call, Progress progress) {
        final URI release;
        try {
            release = URI.create(call.getString("url", ""));
            if (!ReleaseAsset.trusted(release, false)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException e) { call.reject("Choose a SplitTrip React APK from the app's official release."); return; }
        downloads.execute(() -> {
            File apk = null;
            try {
                File dir = new File(activity.getCacheDir(), "apk-updates");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Unable to prepare update download.");
                File[] cached = dir.listFiles();
                if (cached != null) for (File old : cached) {
                    if (old.lastModified() < System.currentTimeMillis() - 86400000L) old.delete();
                }
                apk = File.createTempFile("splittrip-react-", ".apk", dir);
                download(release, apk, progress);
                String version = verifiedVersion(activity, apk);
                File verified = apk;
                activity.runOnUiThread(() -> confirm(activity, call, verified, version));
            } catch (Exception e) {
                if (apk != null) apk.delete();
                call.reject(e.getMessage() == null ? "Could not verify the SplitTrip update." : e.getMessage());
            }
        });
    }

    private static void download(URI release, File apk, Progress progress) throws IOException {
        progress.report(null);
        URI next = release;
        for (int hop=0; hop<6; hop++) {
            if (!ReleaseAsset.trusted(next, hop>0)) throw new IOException("The download host is outside the release source.");
            HttpsURLConnection connection = (HttpsURLConnection)next.toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept", "application/octet-stream");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400 && connection.getHeaderField("Location") != null) {
                    next = next.resolve(connection.getHeaderField("Location"));
                    continue;
                }
                int length = connection.getContentLength();
                if (status != 200 || length > MAX_BYTES) throw new IOException("The APK download is unavailable or too large.");
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    long total = 0;
                    int last = 0;
                    if (length > 0) progress.report(0);
                    byte[] buffer = new byte[32768];
                    int size;
                    while ((size=in.read(buffer)) != -1) {
                        total += size;
                        if (total > MAX_BYTES) throw new IOException("The APK exceeds the size limit.");
                        out.write(buffer,0,size);
                        if (length > 0) {
                            int percent = (int)Math.min(99, 100L * total / length);
                            if (percent != last) { progress.report(percent); last = percent; }
                        }
                    }
                    if (length > 0 && total != length) throw new IOException("The APK download was interrupted.");
                }
                progress.report(100);
                return;
            } finally { connection.disconnect(); }
        }
        throw new IOException("The release download returned too many redirects.");
    }

    @SuppressWarnings("deprecation")
    private static String verifiedVersion(Activity activity, File apk) throws Exception {
        PackageManager pm = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo current = pm.getPackageInfo(activity.getPackageName(), flags);
        PackageInfo candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (candidate == null) throw new IOException("Android could not read the downloaded APK.");
        long installed = Build.VERSION.SDK_INT >= 28 ? current.getLongVersionCode() : current.versionCode;
        long offered = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        ReleaseAsset.verifyIdentity(current.packageName, candidate.packageName, signers(current), signers(candidate), installed, offered);
        return candidate.versionName == null ? Long.toString(offered) : candidate.versionName;
    }

    @SuppressWarnings("deprecation")
    private static Set<Signature> signers(PackageInfo info) {
        Signature[] values = Build.VERSION.SDK_INT >= 28 ?
            (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        return values == null ? new HashSet<>() : new HashSet<>(Arrays.asList(values));
    }

    private static void confirm(Activity activity, PluginCall call, File file, String version) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            file.delete(); call.reject("Reopen SplitTrip to finish the update."); return;
        }
        new AlertDialog.Builder(activity).setTitle("Install SplitTrip " + version + "?")
            .setMessage("The package and signing certificate match this installation.")
            .setNegativeButton("Cancel", (dialog, which) -> { file.delete(); call.resolve(); })
            .setOnCancelListener(dialog -> { file.delete(); call.resolve(); })
            .setPositiveButton("Continue", (dialog, which) -> {
                try {
                    if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:"+APP_ID)));
                        file.delete(); call.reject("Allow updates from SplitTrip in Settings, then select the update again."); return;
                    }
                    Uri source = FileProvider.getUriForFile(activity, APP_ID+".fileprovider", file);
                    Intent installer = new Intent(Intent.ACTION_VIEW).setDataAndType(source, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.startActivity(installer);
                    call.resolve();
                } catch (Exception e) { file.delete(); call.reject("Could not open the Android package installer."); }
            }).show();
    }
}
