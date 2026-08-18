import { registerPlugin } from '@capacitor/core';

type NativeGoogleAuthResponse = {
  idToken: string;
  email?: string | null;
  name?: string | null;
  imageUrl?: string | null;
};

type NativeGoogleAuthPlugin = {
  signIn(options: { clientId: string }): Promise<NativeGoogleAuthResponse>;
};

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>('NativeGoogleAuth');

export const signInWithNativeGoogle = async (clientId: string): Promise<NativeGoogleAuthResponse> => {
  return NativeGoogleAuth.signIn({ clientId });
};
