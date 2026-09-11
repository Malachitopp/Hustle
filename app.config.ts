/**
 * The app config: app.json plus what depends on the build's environment. Google sign-in needs
 * the app to own a URL scheme made from its iOS client id, so Google can hand the sign-in back
 * to it. The id comes from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, the same variable the app reads at
 * run time, so a build without it simply has no Google sign-in, as a build without a Supabase
 * project has no sign-in at all.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

const GOOGLE_SIGN_IN_PLUGIN = '@react-native-google-signin/google-signin';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const plugins = config.plugins ?? [];
  return {
    ...config,
    name: config.name ?? 'Hustle',
    slug: config.slug ?? 'hustle',
    plugins: iosClientId
      ? [...plugins, [GOOGLE_SIGN_IN_PLUGIN, { iosUrlScheme: urlSchemeFor(iosClientId) }]]
      : plugins,
  };
};

/**
 * The URL scheme Google's iOS SDK expects: the client id "123-abc.apps.googleusercontent.com"
 * reversed into "com.googleusercontent.apps.123-abc".
 */
function urlSchemeFor(iosClientId: string): string {
  const suffix = '.apps.googleusercontent.com';
  const id = iosClientId.endsWith(suffix) ? iosClientId.slice(0, -suffix.length) : iosClientId;
  return `com.googleusercontent.apps.${id}`;
}
