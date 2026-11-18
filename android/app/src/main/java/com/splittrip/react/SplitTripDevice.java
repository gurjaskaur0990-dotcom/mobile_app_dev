package com.splittrip.react;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name="SplitTripDevice")
public class SplitTripDevice extends Plugin {
    static final String FOREGROUND_CHANNEL = "low_importance_channel";
    static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("high_importance_channel", "Trip notifications", NotificationManager.IMPORTANCE_HIGH));
        NotificationChannel quiet = new NotificationChannel(FOREGROUND_CHANNEL, "While SplitTrip is open", NotificationManager.IMPORTANCE_LOW);
        quiet.setSound(null, null);
        manager.createNotificationChannel(quiet);
    }

    private int configId(String name) {
        return getContext().getResources().getIdentifier(name, "string", getContext().getPackageName());
    }

    @PluginMethod
    public void configuration(PluginCall call) {
        JSObject result = new JSObject();
        result.put("messaging", configId("google_app_id") != 0 && configId("gcm_defaultSenderId") != 0);
        call.resolve(result);
    }

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        int client = configId("default_web_client_id");
        if (client == 0) {
            call.reject("Add the Firebase Android registration for com.splittrip.react with its Google OAuth client to enable sign-in.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            GetSignInWithGoogleOption google = new GetSignInWithGoogleOption.Builder(getContext().getString(client)).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(google).build();
            CredentialManager.create(getActivity()).getCredentialAsync(getActivity(), request, null,
                ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (!(credential instanceof CustomCredential) ||
                            !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            call.reject("Google returned an unsupported credential.");
                            return;
                        }
                        try {
                            GoogleIdTokenCredential token = GoogleIdTokenCredential.createFrom(credential.getData());
                            JSObject result = new JSObject();
                            result.put("idToken", token.getIdToken());
                            call.resolve(result);
                        } catch (Exception e) {
                            call.reject("Google could not provide a sign-in token.");
                        }
                    }
                    @Override public void onError(GetCredentialException error) {
                        call.reject("Google sign-in did not complete. Check the account and Android OAuth registration.");
                    }
                });
        });
    }

    @PluginMethod
    public void googleSignOut(PluginCall call) {
        CredentialManager.create(getActivity()).clearCredentialStateAsync(new ClearCredentialStateRequest(), null,
            ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override public void onResult(Void unused) { call.resolve(); }
                @Override public void onError(ClearCredentialException error) { call.reject("Could not clear the Google account selection."); }
            });
    }

    @PluginMethod
    public void wallpaperColors(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= 31) {
            int color = getContext().getColor(android.R.color.system_accent1_600);
            result.put("accent", String.format(Locale.ROOT, "#%06x", color & 0xffffff));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void foregroundNotification(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.resolve();
            return;
        }
        String title = call.getString("title", "SplitTrip");
        String body = call.getString("body", "");
        String messageId = call.getString("messageId", UUID.randomUUID().toString());
        String trip = call.getString("tripId", "");
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("google.message_id", messageId);
        if (!trip.isEmpty()) open.putExtra("tripId", trip);
        PendingIntent tap = PendingIntent.getActivity(context, messageId.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, FOREGROUND_CHANNEL)
            .setSmallIcon(R.drawable.ic_trip_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(tap).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true).setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW);
        context.getSystemService(NotificationManager.class).notify(messageId, 1, builder.build());
        call.resolve();
    }

    @PluginMethod
    public void openUpdate(PluginCall call) {
        ApkUpdate.start(getActivity(), call, percent -> {
            JSObject state = new JSObject();
            if (percent != null) state.put("percent", percent);
            notifyListeners("updateProgress", state);
        });
    }
}
