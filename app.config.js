const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'your-ios-client-id.apps.googleusercontent.com';
const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;

module.exports = {
  expo: {
    name: 'Wooru',
    slug: 'wooru',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'wooru',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FAF8F4',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'in.wooru.app',
    },
    android: {
      usesCleartextTraffic: true,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0F3732',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: 'in.wooru.app',
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme,
        },
      ],
      'expo-secure-store',
      '@react-native-community/datetimepicker',
      [
        'expo-image-picker',
        {
          photosPermission: 'The app accesses your photos to let you share business and product images.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/adaptive-icon.png',
          color: '#0F3732',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '6dcab1c4-815e-4b14-9b6f-e83939e2c0d9',
      },
    },
  },
};
