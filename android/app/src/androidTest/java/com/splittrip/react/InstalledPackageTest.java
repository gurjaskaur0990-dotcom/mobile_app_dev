package com.splittrip.react;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.ProviderInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class InstalledPackageTest {
    @Test
    public void mainBuildUsesItsOwnPrivateUpdateProvider() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.splittrip.react", app.getPackageName());
        ProviderInfo provider = app.getPackageManager().resolveContentProvider(
                "com.splittrip.react.fileprovider", 0);
        assertNotNull(provider);
        assertFalse(provider.exported);
        assertTrue(provider.grantUriPermissions);
    }
}
