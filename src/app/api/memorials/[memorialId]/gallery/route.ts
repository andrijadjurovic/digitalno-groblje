import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getFirebaseAdminServices } from "../../../../../lib/firebase-admin";
import { getR2Services } from "../../../../../lib/r2";

const maxImageSize = 1_000_000;
const validMemorialIds = new Set(["1", "2", "3", "4", "5", "6"]);

type StoredPhoto = {
  id: string;
  image: string;
  createdAt: number;
};

class GalleryLimitError extends Error {}
class InvalidGalleryError extends Error {}

function readGalleryPhotos(value: unknown): StoredPhoto[] {
  if (!Array.isArray(value) || value.length > 10) {
    throw new InvalidGalleryError("Galerija ima neispravan format.");
  }

  return value.map((photo) => {
    if (
      typeof photo !== "object"
      || photo === null
      || !("id" in photo)
      || typeof photo.id !== "string"
      || !photo.id
      || !("image" in photo)
      || typeof photo.image !== "string"
      || !("createdAt" in photo)
      || typeof photo.createdAt !== "number"
      || !Number.isSafeInteger(photo.createdAt)
    ) {
      throw new InvalidGalleryError("Galerija ima neispravan format.");
    }
    return { id: photo.id, image: photo.image, createdAt: photo.createdAt };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ memorialId: string }> },
) {
  const { memorialId } = await params;
  if (!validMemorialIds.has(memorialId)) {
    return Response.json({ error: "Uspomena nije pronađena." }, { status: 404 });
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    return Response.json({ error: "Potrebna je prijava prije dodavanja slike." }, { status: 401 });
  }

  let firebase;
  try {
    firebase = getFirebaseAdminServices();
  } catch (error) {
    console.error("Firebase Admin gallery configuration error:", error);
    return Response.json({ error: "Serverska Firebase konfiguracija nije podešena." }, { status: 503 });
  }

  try {
    await firebase.auth.verifyIdToken(token);
  } catch {
    return Response.json({ error: "Firebase prijava nije važeća. Osvježite stranicu i pokušajte ponovo." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Zahtjev ne sadrži ispravnu sliku." }, { status: 400 });
  }
  const image = formData.get("image");
  if (!(image instanceof File)) {
    return Response.json({ error: "Slika nedostaje u zahtjevu." }, { status: 400 });
  }
  if (image.type !== "image/webp") {
    return Response.json({ error: "Galerija prihvata samo WebP slike." }, { status: 415 });
  }
  if (image.size === 0 || image.size > maxImageSize) {
    return Response.json({ error: "Slika mora biti veća od 0 i manja od 1 MB." }, { status: 413 });
  }
  const imageHeader = new Uint8Array(await image.slice(0, 12).arrayBuffer());
  if (
    imageHeader.length < 12
    || imageHeader[0] !== 0x52
    || imageHeader[1] !== 0x49
    || imageHeader[2] !== 0x46
    || imageHeader[3] !== 0x46
    || imageHeader[8] !== 0x57
    || imageHeader[9] !== 0x45
    || imageHeader[10] !== 0x42
    || imageHeader[11] !== 0x50
  ) {
    return Response.json({ error: "Datoteka nije ispravna WebP slika." }, { status: 415 });
  }

  let r2;
  try {
    r2 = getR2Services();
  } catch (error) {
    console.error("Cloudflare R2 gallery configuration error:", error);
    return Response.json({ error: "Serverska Cloudflare R2 konfiguracija nije podešena." }, { status: 503 });
  }

  const id = randomUUID();
  const key = `memorials/${memorialId}/gallery/${id}.webp`;
  const photo: StoredPhoto = {
    id,
    image: `${r2.publicBaseUrl}/${key}`,
    createdAt: Date.now(),
  };
  let uploaded = false;

  try {
    await r2.client.send(new PutObjectCommand({
      Bucket: r2.bucketName,
      Key: key,
      Body: new Uint8Array(await image.arrayBuffer()),
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }));
    uploaded = true;

    const galleryRef = firebase.db.collection("memorialGalleries").doc(memorialId);
    await firebase.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(galleryRef);
      const existingPhotos = snapshot.exists
        ? readGalleryPhotos(snapshot.data()?.photos)
        : [];
      if (existingPhotos.length >= 10) {
        throw new GalleryLimitError("Galerija je dostigla maksimum od 10 slika.");
      }
      transaction.set(galleryRef, { photos: [...existingPhotos, photo] });
    });

    return Response.json(photo, { status: 201 });
  } catch (error) {
    if (uploaded) {
      try {
        await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucketName, Key: key }));
      } catch (cleanupError) {
        console.error("Failed to remove an unregistered R2 gallery image:", cleanupError);
      }
    }
    if (error instanceof GalleryLimitError || error instanceof InvalidGalleryError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("R2 gallery upload failed:", error);
    return Response.json({ error: "Slika nije sačuvana. Provjerite R2 i Firebase podešavanja." }, { status: 500 });
  }
}
