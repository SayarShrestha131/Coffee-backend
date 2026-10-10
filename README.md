# Backend guide

The backend is a Node.js and Express API backed by MongoDB. It owns account authentication, persisted carts and favorites, order records, and server-side product/customization validation.

## Request flow

`src/server.js` loads environment configuration, connects to MongoDB, syncs the product catalog, and mounts the API routes. `src/routes/auth.js` handles account and profile actions. `src/routes/shop.js` handles products, carts, favorites, and orders. Protected routes use `src/middleware/requireAuth.js` to verify the JWT and identify the current user. Mongoose models in `src/models/` define the stored records.

The backend catalog in `src/catalog.js` is the source of truth for item prices and valid customizations at checkout. Keep it aligned with the frontend display catalog in `../frontend/src/data/mockData.js` when changing products or prices.

## Important files

| Path | Responsibility |
|---|---|
| `src/server.js` | Environment checks, database connection, middleware, and route mounting |
| `src/routes/auth.js` | Registration, login, email verification, password reset, and profile |
| `src/routes/shop.js` | Products, cart, favorites, and order endpoints |
| `src/middleware/requireAuth.js` | Bearer-token authentication for protected routes |
| `src/models/` | MongoDB schemas for users, products, carts, favorites, and orders |
| `src/catalog.js` | Product prices and valid size/milk/topping choices |
| `src/seed.js` | Optional catalog seeding command |
| `src/utils/email.js` | SMTP delivery of verification and password-reset codes |

## API overview

All paths are relative to `/api`. The health endpoint is public; all other shop endpoints and `/auth/me` require a valid JWT supplied by the frontend.

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Check API and MongoDB connection |
| `POST` | `/auth/register` | Public | Create an account and send a verification code |
| `POST` | `/auth/verify-email` | Public | Verify email and issue a sign-in token |
| `POST` | `/auth/resend-verification` | Public | Send a new verification code |
| `POST` | `/auth/login` | Public | Sign in and issue a token |
| `POST` | `/auth/forgot-password` | Public | Request a password-reset code |
| `POST` | `/auth/reset-password` | Public | Set a new password using a reset code |
| `GET` / `PATCH` | `/auth/me` | Authenticated | Read or update the signed-in profile |
| `GET` | `/products` | Authenticated | Read the product catalog |
| `GET` / `PUT` | `/cart` | Authenticated | Read or replace the signed-in user's cart |
| `GET` / `PUT` | `/favorites` | Authenticated | Read or replace favorite product IDs |
| `GET` / `POST` | `/orders` | Authenticated | Read order history or place an order |

## Configure and run

1. From the repository root, copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI` to your MongoDB connection string and `JWT_SECRET` to a private random value of at least 32 characters.
3. Configure `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD` to enable verification and password-reset email. For Gmail, use `smtp.gmail.com`, port `587`, and `SMTP_SECURE=false`; `SMTP_USER` must be your complete Gmail address and `SMTP_PASSWORD` must be a Google App Password (not your regular account password). Google requires 2-Step Verification before you can create an App Password. `EMAIL_FROM` is optional and defaults to `SMTP_USER`.
4. From the `backend/` directory, install dependencies and start the API:

```powershell
npm.cmd install
npm.cmd run dev
```

The API listens on port `4000` by default. `APP_ORIGIN` controls the allowed CORS origin and defaults to `*`. Check `http://localhost:4000/api/health` for the API and database status. Never commit `backend/.env` or expose its secrets to the mobile app.

If signup reports that email delivery was rejected, correct `SMTP_USER` and `SMTP_PASSWORD` in `backend/.env`, restart the API, and submit signup again with the same email address to send a fresh verification code.

For local-only testing when SMTP is unavailable, set `NODE_ENV=development` and `DEV_EMAIL_CODE=true` in `backend/.env`, then restart the API. Signup will return the one-time verification code to the app instead of sending email. This mode deliberately exposes verification codes and must never be enabled in a production deployment; production must use email delivery with `DEV_EMAIL_CODE=false`.

## Available commands

```powershell
npm.cmd run dev    # Restart the server when source files change
npm.cmd start      # Start the server once
npm.cmd run seed   # Seed the product catalog
```

Order placement records the chosen payment method; it does not charge a payment provider.
