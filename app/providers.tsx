import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { replaceTracked } from '../lib/navigation';

/**
 * Re-entry point for the Providers screen, which itself lives at `/`.
 *
 * `/` is not a URL the deployed site serves the app for — `build-admin.js` puts
 * the marketing page at `dist/index.html` and Vercel resolves the filesystem
 * before the `/:path*` → `/app.html` rewrite, so the root always resolves to
 * marketing (see `canReloadIntoApp()` in `lib/siteUrl.ts`). A browser reload on
 * Providers therefore left the app entirely. `public/landing.html` now forwards
 * a reloaded tab here instead, and `/providers` *does* fall through the rewrite,
 * so the shell loads and this hands the user back to the screen they were on.
 *
 * Deliberately a bridge rather than a second home: the Providers screen belongs
 * to the `(tabs)` group, and rendering a copy outside it would desynchronise the
 * bottom nav's active tab from the route.
 */
export default function ProvidersEntryScreen() {
  const router = useRouter();
  const { isLoading, session, profile } = useAuth();

  useEffect(() => {
    // Wait for auth to resolve before replacing. Two guards in `app/_layout.tsx`
    // depend on it: a session without a profile is mid-hydration and it bails,
    // and a *cold* load already sitting at `/` is punted to the MCN hub on the
    // grounds that the root is the framework's initial route rather than a
    // screen anyone chose. Replacing early would land us at `/` before that
    // guard had resolved once, and the punt would fire — sending a resident who
    // reloaded on Providers to `/network` instead.
    if (isLoading || !session || !profile) return;
    replaceTracked(router, '/');
  }, [isLoading, session, profile, router]);

  // No session, or a session with no community: `app/_layout.tsx` owns those
  // redirects and will move us on. Nothing to render but the same spinner the
  // root layout shows while auth resolves.
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Verandah.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.surface,
  },
});
