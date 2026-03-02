# Google Merchant Center OAuth Setup Guide

## Overview
This project uses **OAuth2 Authorization Code flow with PKCE** to connect to Google Merchant Center. No service account JSON keys are required.

## Prerequisites
- A Google Cloud Platform project
- A Google Merchant Center account (note the numeric Merchant ID)
- The "Content API for Shopping" enabled in your GCP project

## Step 1: Enable the Content API

1. Go to [Google Cloud Console → APIs & Services](https://console.cloud.google.com/apis/library)
2. Search for "Content API for Shopping"
3. Click **Enable**

## Step 2: Create OAuth Consent Screen

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Choose **External** (or Internal if using Google Workspace)
3. Fill in:
   - App name: `GetPawsy Merchant Integration`
   - User support email: your email
   - Authorized domains: `getpawsy.pet`
   - Developer contact email: your email
4. Add scope: `https://www.googleapis.com/auth/content`
5. Add your admin email as a test user (required while app is in "Testing" status)

## Step 3: Create OAuth Client Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth Client ID**
3. Application type: **Web application**
4. Name: `GetPawsy Merchant OAuth`
5. Authorized redirect URIs:
   - Production: `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/merchant-oauth-callback`
   - (The callback goes through the edge function, not the frontend)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

## Step 4: Set Environment Variables (Lovable Secrets)

Add these secrets in Lovable Cloud:

| Secret Name | Value |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Your OAuth Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Your OAuth Client Secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/merchant-oauth-callback` |
| `GOOGLE_MERCHANT_CENTER_ID` | Your numeric Merchant Center ID |
| `APP_BASE_URL` | `https://getpawsy.pet` |
| `TOKEN_ENCRYPTION_KEY` | A random 32+ character string (e.g., generate with `openssl rand -hex 32`) |

## Step 5: Find Your Merchant Center ID

1. Go to [Google Merchant Center](https://merchants.google.com/)
2. Your Merchant ID is in the top-right corner (numeric, e.g., `123456789`)

## Step 6: Connect

1. Go to `/admin/integrations/merchant` in your admin panel
2. Click **Connect Google Merchant**
3. Sign in with the Google account that has access to the Merchant Center
4. Grant the requested permissions
5. You'll be redirected back to the admin page with `?connected=1`

## How to Test

1. ✅ Enable "Content API for Shopping" in your GCP project
2. ✅ Set all environment variables listed above
3. ✅ Navigate to `/admin/integrations/merchant`
4. ✅ Click "Connect Google Merchant" — should redirect to Google consent
5. ✅ After consent, should return to admin page showing "Connected"
6. ✅ Click "Run Sync Now" — should show product count and issues
7. ✅ Verify no service account key files exist anywhere in the codebase

## Security Notes

- Refresh tokens are encrypted with AES-GCM using `TOKEN_ENCRYPTION_KEY`
- Tokens are stored server-side only (never exposed to browser)
- All endpoints require admin authentication
- PKCE prevents authorization code interception
- OAuth state parameter prevents CSRF attacks
- Sync endpoint is rate-limited to 1 request per minute

## Troubleshooting

| Problem | Solution |
|---|---|
| "Access Denied" after consent | Add your email as a test user in OAuth consent screen |
| "Token refresh failed" | Reconnect — the refresh token may have been revoked |
| "GOOGLE_OAUTH_CLIENT_ID not configured" | Set the secret in Lovable Cloud |
| "Content API not enabled" | Enable it in GCP Console → APIs & Services |
| Rate limit error on sync | Wait 60 seconds and try again |
