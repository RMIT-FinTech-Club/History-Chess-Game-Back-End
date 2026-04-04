import { config } from '../configs/unifiedConfig';

console.log('--- Google Auth Config Debug ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('GOOGLE_CLIENT_ID:', config.google.clientId);
console.log('GOOGLE_CLIENT_SECRET:', config.google.clientSecret ? '***PRESENT***' : '***MISSING***');
console.log('BACKEND_URL:', config.app.backendUrl);
console.log('REDIRECT_URI:', `${config.app.backendUrl}/users/google-callback`);
console.log('------------------------------');

if (config.app.backendUrl.includes('vercel.app') && process.env.NODE_ENV === 'development') {
    console.warn('⚠️ WARNING: Backend URL is pointing to Vercel even though you are in development mode!');
}

console.log('\nCopy this URI into your Google Console -> Authorized redirect URIs:');
console.log(`${config.app.backendUrl}/users/google-callback`);
