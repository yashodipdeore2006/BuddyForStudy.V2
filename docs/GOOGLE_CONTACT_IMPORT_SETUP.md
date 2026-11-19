# Google contact import

## Google Cloud configuration

1. Open the Google Cloud project used by BuddyForStudy Google Sign-In.
2. Enable the **People API** for that project.
3. Keep the existing Web OAuth client. The same Web client ID must be configured as `GOOGLE_CLIENT_ID` on the API and `VITE_GOOGLE_CLIENT_ID` in the frontend.
4. Add every real frontend origin used by the app to **Authorized JavaScript origins**. Examples:
   - `http://localhost:5173`
   - `https://buddyforstudy.in`
   - `https://www.buddyforstudy.in`
5. Request these scopes only when the learner chooses **Import from Google**:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/user.phonenumbers.read`
   - `https://www.googleapis.com/auth/user.addresses.read`
6. Complete Google's app verification process for the sensitive People API scopes before offering this feature to the public. Explain the purpose of contact import in the consent screen and privacy policy.

Google can grant one scope and deny the other. The People API may return no phone number or address even when access is granted. The learner can always enter details manually.

## API environment

The normal Google sign-in variables remain:

```env
GOOGLE_CLIENT_ID=your-web-client-id
```

No Google refresh token is stored. The short-lived Google access token is sent to the authenticated API endpoint for one-time import, checked against the Google identity linked to the BuddyForStudy account, and not persisted or logged.

## Learner experience

1. The learner signs in with Google using the existing basic OpenID flow.
2. A Google sign-up is routed to the profile page.
3. The learner clicks **Import from Google** and decides whether to grant phone-number and address scopes.
4. BuddyForStudy displays available suggestions in editable fields. The learner can also enter everything manually.
5. The learner saves the contact details.
6. Phone numbers are stored as contact information only. BuddyForStudy does not send SMS, issue mobile OTPs, or mark the number as verified.

## Endpoints

- `GET /api/auth/google/config` — public Google client configuration.
- `POST /api/auth/google/contact-data` — authenticated, one-time Google People API import.
- `PUT /api/auth/profile` — save editable phone number, city and address fields.

Changing the phone number resets its verification state. Google-imported phone numbers remain unverified and must not be used as proof of identity or for sensitive account recovery.
