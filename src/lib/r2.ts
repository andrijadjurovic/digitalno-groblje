import { S3Client } from "@aws-sdk/client-s3";

export function getR2Services() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    const missing = [
      ["R2_ACCOUNT_ID", accountId],
      ["R2_ACCESS_KEY_ID", accessKeyId],
      ["R2_SECRET_ACCESS_KEY", secretAccessKey],
      ["R2_BUCKET_NAME", bucketName],
      ["R2_PUBLIC_BASE_URL", publicBaseUrl],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(`Nedostaje R2 konfiguracija: ${missing.join(", ")}`);
  }

  let publicUrl: URL;
  try {
    publicUrl = new URL(publicBaseUrl);
  } catch {
    throw new Error("R2_PUBLIC_BASE_URL mora biti ispravan HTTPS URL.");
  }
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
    throw new Error("R2_PUBLIC_BASE_URL mora biti HTTPS URL bez korisničkih podataka, upita ili fragmenta.");
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucketName,
    publicBaseUrl: publicUrl.toString().replace(/\/+$/, ""),
  };
}
