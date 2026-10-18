This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Firebase setup

The cemetery's candle and flower totals are stored in Cloud Firestore and update live for visitors.

1. In Firebase Console, enable **Authentication → Sign-in method → Anonymous**. Visitors are signed in automatically; they do not create or manage accounts.
2. Copy the Firebase web-app settings from `.env.example` into `.env.local` and fill in the values from **Project settings → Your apps**. Never commit `.env.local`.
3. In **Firestore Database → Rules**, publish the rules from [`firestore.rules`](./firestore.rules). The app can only read the seven sample memorial counters, increment one counter by one per write, create immutable offering entries with the selected product, dedication, signature, and timestamp, and read gallery metadata.
4. Restart the development server after changing environment variables.

The current seven sample memorials are defined in the app; Firestore stores their additional candle and flower totals in `memorialOfferings/{memorialId}` documents. Individual gifts and their dedications/signatures are stored in the `memorialOfferings/{memorialId}/items/{itemId}` subcollection. Gallery images are resized to a maximum 1200 px and compressed to WebP (maximum 1 MB) before being uploaded to Cloudflare R2. Firestore stores only each image's public URL and metadata, allows up to ten photos per memorial, and the interface shows up to six. Anonymous Authentication is required to read galleries and upload images. The seventh sample memorial starts with no candles or flowers for testing the gift flow.

You do not need to create the `memorialOfferings` collection or its `items` subcollections manually. Firestore creates them on the first successful gift save; until then, missing documents and empty subcollections are expected. If the app reports `permission-denied`, enable Anonymous sign-in and publish `firestore.rules` to the same Firebase project configured in `.env.local`, then reload the app. The `memorialGalleries` document is created by the first successful gallery upload.

The optional ambient soundtrack is generated in the browser with the Web Audio API as softly decaying piano notes with a subtle filtered nature ambience and occasional bird-like chirps; it starts only after the visitor selects the sound button and can be muted there at any time.

### Cloudflare R2 gallery setup

1. Create an R2 bucket in Cloudflare and enable public access using either an `r2.dev` URL or a custom domain. Put that HTTPS base URL (without a trailing slash) in `R2_PUBLIC_BASE_URL`.
2. Create an R2 API token with **Object Read & Write** permissions limited to this bucket. Set its access key ID, secret, account ID, and bucket name in the `R2_*` variables in `.env.local` and in the hosting provider's server-side environment variables. Never use a `NEXT_PUBLIC_` prefix for R2 credentials.
3. Create a Firebase service account for the same Firebase project, grant it Firestore read/write access (for example, the **Cloud Datastore User** role), then set its project ID, client email, and private key as `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY`. Keep these values server-only. When setting the private key as an environment variable, preserve line breaks or use `\n` escapes.
4. Restart/redeploy the Next.js server after setting the variables. Gallery uploads use the server route to verify the Firebase ID token, write the image to R2, and transactionally add its URL to Firestore. Firestore client rules are read-only for gallery documents.

Older gallery photos stored as Base64 data in Firestore remain visible; newly added photos go to R2. Their existing data can be migrated to R2 separately.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
