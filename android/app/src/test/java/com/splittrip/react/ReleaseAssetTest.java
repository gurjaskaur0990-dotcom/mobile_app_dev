package com.splittrip.react;

import static org.junit.Assert.*;
import java.net.URI;
import java.io.IOException;
import java.util.Set;
import org.junit.Test;

public class ReleaseAssetTest {
    private static final String REPO = "https://github.com/gurjaskaur0990-dotcom/mobile_app_dev/releases/download/v1.2.0/";
    @Test public void acceptsReactAssetsOnlyWithinTheReleaseRepository() {
        assertTrue(ReleaseAsset.trusted(URI.create(REPO+"splittrip-react-v1.2.0.apk"),false));
        assertFalse(ReleaseAsset.trusted(URI.create(REPO+"splittrip-flutter.apk"),false));
        assertFalse(ReleaseAsset.trusted(URI.create(REPO.replace("mobile_app_dev","other")+"splittrip-react.apk"),false));
        assertFalse(ReleaseAsset.trusted(URI.create(REPO.replace("github.com","github.com.evil.invalid")+"splittrip-react.apk"),false));
        assertFalse(ReleaseAsset.trusted(URI.create(REPO+"..%2fsplittrip-react.apk"),false));
        URI asset = URI.create("https://release-assets.githubusercontent.com/file?signature=sample");
        assertFalse(ReleaseAsset.trusted(asset,false));
        assertTrue(ReleaseAsset.trusted(asset,true));
        assertFalse(ReleaseAsset.trusted(URI.create("http://objects.githubusercontent.com/file"),true));
    }
    @Test public void checksPackageEverySignerAndIncreasingVersion() throws IOException {
        String id = ReleaseAsset.APP_ID;
        Set<String> signers = Set.of("development");
        ReleaseAsset.verifyIdentity(id, id, signers, signers, 1, 2);
        assertThrows(IOException.class, () -> ReleaseAsset.verifyIdentity(id, "com.splittrip.split_trip", signers, signers, 1, 2));
        assertThrows(IOException.class, () -> ReleaseAsset.verifyIdentity(id, id, signers, Set.of("other"), 1, 2));
        assertThrows(IOException.class, () -> ReleaseAsset.verifyIdentity(id, id, signers, Set.of("development","other"), 1, 2));
        assertThrows(IOException.class, () -> ReleaseAsset.verifyIdentity(id, id, Set.of(), Set.of(), 1, 2));
        assertThrows(IOException.class, () -> ReleaseAsset.verifyIdentity(id, id, signers, signers, 2, 2));
    }
}
