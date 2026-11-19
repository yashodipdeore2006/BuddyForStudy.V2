# Google contact import and phone verification

## Google Cloud configuration

1. Open the Google Cloud project used by BuddyForStudy Google Sign-In.
2. Enable the **People API** for that project.
3. Keep the existing Web OAuth client. The same Web client ID must be configured as `GOOGLE_CLIENT_ID` on the API and `VITE_GOOGLE_CLIENT_ID` in the frontend.
4. Add every real frontend origin used by the app to **Authorized JavaScript origins**. Examples:
   - `http://localhost:5173`
   - `https://buddyforstudy.in`
   - `https://www.buddyforstudy.in`
5. Add the following scopes to the OAuth consent configuration:
   - `openid`
   - `email`
   - `https://www.googleapis.com/auth/user.phonenumbers.read`
   - `https://www.googleapis.com/auth/user.addresses.read`
6. Complete Google's app verification process for the sensitive People API scopes before offering this feature to the public. Provide a clear explanation in the consent screen and privacy policy about why BuddyForStudy imports phone numbers and addresses.

The application requests these permissions only after the learner clicks **Import from Google**. Google can grant one scope and deny the other; BuddyForStudy handles each field independently. The People API may return no phone number or address even when access was granted.

## API environment

The normal Google sign-in variables remain:

```env
GOOGLE_CLIENT_ID=your-web-client-id
```

No Google refresh token is stored. The short-lived Google access token is sent to the authenticated API endpoint for a one-time import, checked against the Google identity linked to the BuddyForStudy account, and not persisted or logged.

## SMS verification (optional)

Mobile OTP is implemented through Twilio Verify. Create a Verify Service and configure all three values on the backend only:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Do not put these values in frontend environment variables, commit real credentials, or send them to the browser. Configure them in the local server environment and the hosting provider's secret manager. All three values must be provided together. Leaving all three empty disables SMS verification; learners can still save a phone number, but it remains unverified.

Phone numbers sent to Twilio must be in E.164 format, for example `+919876543210`. Twilio Verify manages OTP generation, delivery, expiry, retries and verification. BuddyForStudy marks `phoneNumberVerified=true` only when Twilio returns an approved verification check.

## Learner experience

1. The learner signs in with Google using the existing basic OpenID flow.
2. A Google sign-up is routed to the profile page.
3. The learner clicks **Import from Google** and decides whether to grant phone-number and address scopes.
4. BuddyForStudy displays available suggestions in editable fields. The learner can also enter everything manually.
5. The learner saves the contact details.
6. When Twilio Verify is configured, the learner requests an SMS and enters the code. Without Twilio, the number remains explicitly unverified.

## Endpoints

- `GET /api/auth/google/config` — public Google client and phone-verification capability.
- `POST /api/auth/google/contact-data` — authenticated, one-time Google People API import.
- `PUT /api/auth/profile` — save editable phone number, city and address fields.
- `POST /api/auth/phone/send-otp` — authenticated Twilio Verify SMS request.
- `POST /api/auth/phone/verify-otp` — authenticated verification check.

A changed phone number automatically resets its verification state. A Google-imported number is never treated as verified by itself.
