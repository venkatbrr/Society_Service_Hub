import { GoogleSignin } from '@react-native-google-signin/google-signin';

export function configureGoogleSignIn() {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'dummy-web-client-id',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'dummy-ios-client-id',
  });
}
