import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function getFirebaseAdminServices() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      ["FIREBASE_ADMIN_PROJECT_ID", projectId],
      ["FIREBASE_ADMIN_CLIENT_EMAIL", clientEmail],
      ["FIREBASE_ADMIN_PRIVATE_KEY", privateKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(`Nedostaje Firebase Admin konfiguracija: ${missing.join(", ")}`);
  }

  const appName = "digitalno-groblje-server";
  const app = getApps().find((candidate) => candidate.name === appName)
    ?? initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      },
      appName,
    );

  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
