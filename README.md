# TommyStrats ApexIQ Admin Site

Add these files to your existing `ea-license-api` repository.

Required Netlify environment variables:

- `FIREBASE_SERVICE_ACCOUNT_BASE64`
- `EA_ADMIN_SECRET`

Recommended setup:

1. Copy `public/`, `netlify/functions/`, and `netlify.toml` into your existing repository.
2. Keep your existing `verify-license.mjs` file.
3. Commit and push:
   ```powershell
   git add .
   git commit -m "Add ApexIQ license admin dashboard"
   git push
   ```
4. Wait for Netlify to deploy.
5. Open:
   `https://tommyeacode.netlify.app/admin.html`
6. Enter your `EA_ADMIN_SECRET`.
7. Press **Refresh**.

Admin actions included:

- Generate random `APX-XXXX-XXXX-XXXX` license keys
- List/search licenses
- Copy license key
- Edit customer/account/server/expiry/version
- Extend expiry by 30 days
- Revoke/reactivate
- Delete a license

Security notes:

- Never put `EA_ADMIN_SECRET` inside the EA.
- Never commit Firebase service account credentials to Git.
- The admin secret is not stored in localStorage by this site.
- For a larger commercial service, replace the static secret with real admin authentication.
