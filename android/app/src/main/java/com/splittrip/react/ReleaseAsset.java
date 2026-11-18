package com.splittrip.react;

import java.net.URI;
import java.io.IOException;
import java.util.Set;
import java.util.regex.Pattern;

final class ReleaseAsset {
    static final String APP_ID = "com.splittrip.react";
    private static final Pattern PATH = Pattern.compile(
        "/gurjaskaur0990-dotcom/mobile_app_dev/releases/download/[A-Za-z0-9][A-Za-z0-9._+-]*/splittrip-react[A-Za-z0-9._+-]*\\.apk");
    static boolean trusted(URI uri, boolean redirect) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null ||
            (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawFragment() != null) return false;
        if ("github.com".equalsIgnoreCase(uri.getHost())) {
            return uri.getRawQuery() == null && PATH.matcher(uri.getRawPath()).matches();
        }
        return redirect && ("release-assets.githubusercontent.com".equalsIgnoreCase(uri.getHost()) ||
            "objects.githubusercontent.com".equalsIgnoreCase(uri.getHost()));
    }

    static void verifyIdentity(String installedId, String offeredId, Set<?> installedSigners,
                               Set<?> offeredSigners, long installedVersion, long offeredVersion) throws IOException {
        if (!APP_ID.equals(installedId) || !installedId.equals(offeredId))
            throw new IOException("This file is not an update for SplitTrip React.");
        if (installedSigners.isEmpty() || !installedSigners.equals(offeredSigners))
            throw new IOException("The update has a different signing certificate.");
        if (offeredVersion <= installedVersion)
            throw new IOException("This release is already installed or older.");
    }
}
