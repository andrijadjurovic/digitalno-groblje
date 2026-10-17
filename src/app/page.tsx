"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { signInAnonymously } from "firebase/auth";
import { collection, doc, increment, onSnapshot, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { getFirebaseServices } from "../lib/firebase";
import styles from "./page.module.css";

type Place = "kapija" | "tabla" | "groblje";
type Panel = "search" | "create" | "store" | "weather" | null;
type TimeOfDay = "day" | "night";
type Weather = "sunny" | "rain" | "snow" | "storm";
type StoreCategory = "candles" | "flowers";
type CandleTradition = "all" | "christian" | "universal";
type MemorialFaith = "unspecified" | "christian";
type MemorialFaithFilter = "all" | MemorialFaith;
type MemorialBurialPlace = "cemetery" | "family";
type TombstoneTradition = "christian";
type TombstoneVariant = "model-1" | "model-2" | "model-3";
type TombstoneStyle = `${TombstoneTradition}-${TombstoneVariant}`;

const GRAVES_PER_PAGE = 3;
const memorialSteps = ["Mesto", "Spomenik", "Preminuli", "Fotografije", "Sećanje", "Pregled"];
const snowflakes = Array.from({ length: 64 }, (_, index) => {
  const random = (seed: number) => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const size = 2 + random(index + 1) * 4;

  return {
    id: index,
    style: {
      left: `${random(index + 101) * 100}%`,
      width: `${size}px`,
      height: `${size}px`,
      opacity: 0.35 + random(index + 211) * 0.6,
      animationDuration: `${8 + random(index + 307) * 13}s`,
      animationDelay: `${-random(index + 401) * 21}s`,
      "--snow-drift": `${(random(index + 503) - 0.5) * 18}vw`,
    } as CSSProperties,
  };
});
const lightningFlashes = Array.from({ length: 8 }, (_, index) => {
  const random = (seed: number) => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };

  return {
    id: index,
    style: {
      "--lightning-x": `${8 + random(index + 601) * 84}%`,
      "--lightning-y": `${5 + random(index + 701) * 30}%`,
      "--lightning-radius-x": `${18 + random(index + 801) * 30}vw`,
      "--lightning-radius-y": `${20 + random(index + 901) * 30}vh`,
      "--flash-duration": `${3 + random(index + 1001) * 5}s`,
      "--flash-delay": `${-random(index + 1101) * 8}s`,
    } as CSSProperties,
  };
});

type StoreProduct = {
  id: string;
  name: string;
  category: StoreCategory;
  image: string;
  description: string;
  tradition?: Exclude<CandleTradition, "all">;
  photoCredit?: {
    author: string;
    license: string;
    sourceUrl: string;
    licenseUrl: string;
  };
};

type Memorial = {
  id: number;
  name: string;
  years: string;
  epitaph: string;
  candles: number;
  flowers: number;
  faith: MemorialFaith;
  burialPlace: MemorialBurialPlace;
  tombstoneStyle: TombstoneStyle;
  birthDate?: string;
  deathDate?: string;
  alternateName?: string;
  gender?: "female" | "male";
  image?: string;
};

type OfferingCounts = {
  candles: number;
  flowers: number;
};

type SavedOffering = {
  id: string;
  productId: string;
  dedication: string;
  signature: string;
  createdAt: number;
};

type GalleryPhoto = {
  id: string;
  image: string;
  createdAt: number;
};

const startingMemorials: Memorial[] = [
  { id: 1, name: "Milan Petrović", years: "1947 — 2021", epitaph: "Uvek u našim mislima.", candles: 3, flowers: 3, faith: "christian", burialPlace: "cemetery", tombstoneStyle: "christian-model-1", birthDate: "1947-03-12", deathDate: "2021-11-08" },
  { id: 2, name: "Jelena Nikolić", years: "1958 — 2023", epitaph: "Ljubav ne prestaje odlaskom.", candles: 4, flowers: 3, faith: "christian", burialPlace: "cemetery", tombstoneStyle: "christian-model-2", birthDate: "1958-06-24", deathDate: "2023-09-15" },
  { id: 3, name: "Petar Vuković", years: "1939 — 2018", epitaph: "Po dobru te pamtimo.", candles: 3, flowers: 4, faith: "christian", burialPlace: "cemetery", tombstoneStyle: "christian-model-3", birthDate: "1939-02-18", deathDate: "2018-07-04" },
  { id: 4, name: "Ana Marković", years: "1962 — 2020", epitaph: "Zauvijek dio naših srca.", candles: 4, flowers: 4, faith: "christian", burialPlace: "cemetery", tombstoneStyle: "christian-model-1", birthDate: "1962-10-09", deathDate: "2020-05-22" },
  { id: 5, name: "Nikola Jovanović", years: "1951 — 2019", epitaph: "Tvoja dobrota ostaje s nama.", candles: 3, flowers: 3, faith: "christian", burialPlace: "cemetery", tombstoneStyle: "christian-model-2", birthDate: "1951-08-13", deathDate: "2019-12-01" },
  { id: 6, name: "Marija Popović", years: "1944 — 2022", epitaph: "S ljubavlju čuvamo uspomenu.", candles: 4, flowers: 3, faith: "christian", burialPlace: "cemetery", tombstoneStyle: "christian-model-3", birthDate: "1944-04-27", deathDate: "2022-03-16" },
];

const places: { id: Place; label: string }[] = [
  { id: "kapija", label: "Kapija" },
  { id: "tabla", label: "Oglasna tabla" },
  { id: "groblje", label: "Groblje" },
];

const storeCategories: { id: StoreCategory; label: string }[] = [
  { id: "candles", label: "Sveće" },
  { id: "flowers", label: "Cveće" },
];

const candleTraditions: { id: CandleTradition; label: string }[] = [
  { id: "all", label: "Sve sveće" },
  { id: "christian", label: "Hrišćanstvo" },
  { id: "universal", label: "Univerzalne" },
];

const memorialFaiths: { id: MemorialFaith; label: string }[] = [
  { id: "christian", label: "Hrišćanstvo" },
  { id: "unspecified", label: "Nije navedeno" },
];

const tombstoneTraditions: { id: TombstoneTradition; label: string; faith: MemorialFaith }[] = [
  { id: "christian", label: "Hrišćanstvo", faith: "christian" },
];

const tombstoneVariants: { id: TombstoneVariant; label: string }[] = [
  { id: "model-1", label: "Model 1" },
  { id: "model-2", label: "Model 2" },
  { id: "model-3", label: "Model 3" },
];

const tombstoneModels = tombstoneTraditions.flatMap((tradition) => {
  return tombstoneVariants.map((variant) => {
    const id = `${tradition.id}-${variant.id}` as TombstoneStyle;
    return {
      id,
      image: `/tombstone-models/hriscanstvo_${variant.id.slice(-1)}.${Number(variant.id.slice(-1)) <= 3 ? "jpeg" : "png"}`,
      label: variant.label,
      variant: variant.id,
      tradition: tradition.id,
      faith: tradition.faith,
    };
  });
});

function formatTombstoneDate(date?: string) {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
}

function limitDateYear(date: string) {
  const match = date.match(/^(\d{4,})-(\d{2})-(\d{2})$/);
  return match ? `${match[1].slice(0, 4)}-${match[2]}-${match[3]}` : date;
}

function TombstoneArtwork({ style, className, children, cutout = false }: { style: TombstoneStyle; className: string; children?: ReactNode; cutout?: boolean }) {
  const variant = style.split("-").at(-1);
  const model = tombstoneModels.find((item) => item.id === style);
  const image = cutout && model?.image.endsWith(".jpeg")
    ? model.image.replace(".jpeg", "-cutout.png")
    : model?.image;

  return (
    <div className={`${styles.tombstoneArtwork} ${className}`} data-variant={variant} data-model={style}>
      {image ? (
        <Image
          className={styles.tombstonePhoto}
          src={image}
          alt=""
          fill
          sizes="(max-width: 700px) 90vw, (max-width: 1200px) 30vw, 360px"
          unoptimized
        />
      ) : (
        <span className={styles.tombstoneImagePlaceholder}>Fotografija spomenika<br />biće dodata ovdje</span>
      )}
      {children}
    </div>
  );
}

function TombstoneEngraving({
  name,
  birthDate,
  deathDate,
  years,
}: {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  years?: string;
}) {
  const dateLine = birthDate && deathDate
    ? `${formatTombstoneDate(birthDate)} – ${formatTombstoneDate(deathDate)}`
    : birthDate
      ? `Rođen/a ${formatTombstoneDate(birthDate)}`
      : deathDate
        ? `Preminuo/la ${formatTombstoneDate(deathDate)}`
        : years;

  return (
    <div className={styles.tombstoneEngraving}>
      {name && <b className={styles.tombstoneInscriptionName}>{name}</b>}
      {dateLine && <small className={styles.tombstoneInscriptionDates}>{dateLine}</small>}
    </div>
  );
}

const storeProducts: StoreProduct[] = [
  { id: "glass-candle", name: "Staklena sveća", category: "candles", tradition: "universal", image: "/store-products/light-glass-candle.webp", description: "Topla svetlost u staklenoj posudi." },
  { id: "pillar-candles", name: "Bele sveće", category: "candles", tradition: "universal", image: "/store-products/light-pillar-candles.webp", description: "Klasične sveće za mesto počinka." },
  {
    id: "red-lantern",
    name: "Crveno kandilo",
    category: "candles",
    tradition: "christian",
    image: "/store-products/light-red-lantern.webp",
    description: "Stakleno kandilo koje čuva plamen uspomene.",
    photoCredit: {
      author: "Roman Eisele",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/User:Roman_Eisele",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  },
  {
    id: "red-grave-candle",
    name: "Crvena grobna sveća",
    category: "candles",
    tradition: "universal",
    image: "/store-products/light-red-grave-candle.webp",
    description: "Memorijalna sveća u crvenom zaštitnom kućištu.",
    photoCredit: {
      author: "Usien",
      license: "CC0 1.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:020_Grave_candles.JPG",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
  },
  {
    id: "heart-shaped-lantern",
    name: "Srcoliko stakleno kandilo",
    category: "candles",
    tradition: "universal",
    image: "/store-products/light-heart-lantern.webp",
    description: "Crveno stakleno kandilo u obliku srca.",
    photoCredit: {
      author: "4028mdk09",
      license: "CC BY 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Glasgrableuchte_rot_Herzform.JPG",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    },
  },
  {
    id: "ornate-white-lantern",
    name: "Belo ukrasno kandilo",
    category: "candles",
    tradition: "universal",
    image: "/store-products/light-ornate-white-lantern.webp",
    description: "Stakleno kandilo sa zlatnim ornamentima.",
    photoCredit: {
      author: "Agata Stanisz",
      license: "CC BY-SA 3.0 PL",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wsp%C3%B3%C5%82czesny_znicz_nagrobny_-_Pozna%C5%84_-_001896c.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en",
    },
  },
  {
    id: "bronze-angel-lantern",
    name: "Bronzano kandilo sa anđelom",
    category: "candles",
    tradition: "christian",
    image: "/store-products/light-angel-bronze-lantern.webp",
    description: "Ukrasno kandilo sa figurom anđela.",
    photoCredit: {
      author: "Agata Stanisz",
      license: "CC BY-SA 3.0 PL",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wsp%C3%B3%C5%82czesny_znicz_nagrobny_-_Pozna%C5%84_-_001899c.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en",
    },
  },
  {
    id: "silver-angel-lantern",
    name: "Srebrno kandilo sa anđelom",
    category: "candles",
    tradition: "christian",
    image: "/store-products/light-angel-silver-lantern.webp",
    description: "Svetlo ukrasno kandilo sa anđeoskim figurama.",
    photoCredit: {
      author: "Agata Stanisz",
      license: "CC BY-SA 3.0 PL",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wsp%C3%B3%C5%82czesny_znicz_nagrobny_-_Pozna%C5%84_-_001900c.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en",
    },
  },
  {
    id: "ornate-relief-lantern",
    name: "Kandilo sa reljefnim ukrasom",
    category: "candles",
    tradition: "universal",
    image: "/store-products/light-relief-lantern.webp",
    description: "Tamnije stakleno kandilo sa reljefnim detaljima.",
    photoCredit: {
      author: "Agata Stanisz",
      license: "CC BY-SA 3.0 PL",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Wsp%C3%B3%C5%82czesny_znicz_nagrobny_-_Pozna%C5%84_-_001907c.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en",
    },
  },
  {
    id: "assorted-lanterns",
    name: "Staklena kandila",
    category: "candles",
    tradition: "christian",
    image: "/store-products/light-assorted-lanterns.webp",
    description: "Različite boje stakla i postolja.",
    photoCredit: {
      author: "MichalPL",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/User:MichalPL",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  },
  {
    id: "decorated-candle",
    name: "Kandilo sa anđelom",
    category: "candles",
    tradition: "christian",
    image: "/store-products/light-decorated-candle.webp",
    description: "Kandilo dopunjeno malom figurom.",
    photoCredit: {
      author: "Kritzolina",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Grave_candle_and_decoration_on_a_grave_02.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  },
  { id: "yellow-bouquet", name: "Žuti buket", category: "flowers", image: "/store-products/flower-yellow-bouquet.webp", description: "Vesele boje u jednostavnoj staklenoj vazi." },
  {
    id: "daffodils-in-vase",
    name: "Narcisi u staklenoj vazi",
    category: "flowers",
    image: "/store-products/flower-daffodils.webp",
    description: "Prolećni buket žutih narcisa sa nežnim cvetnim akcentima.",
    photoCredit: {
      author: "Rept0n1x",
      license: "CC BY-SA 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Vase_of_flowers,_Birkenhead_(1).JPG",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
  },
  {
    id: "ranunculus-eucalyptus",
    name: "Ranunkule i eukaliptus",
    category: "flowers",
    image: "/store-products/flower-ranunculus-eucalyptus.webp",
    description: "Šaren buket ranunkula sa grančicama eukaliptusa.",
    photoCredit: {
      author: "Anbertin20",
      license: "CC BY-SA 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Vase_of_Ranunculus_and_Eucalyptus.jpg",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  },
  { id: "mixed-bouquet", name: "Buket u saksiji", category: "flowers", image: "/store-products/flower-mixed-bouquet.webp", description: "Raznobojno cveće u rustičnoj posudi." },
  {
    id: "red-bouquet",
    name: "Buket crvenih ruža",
    category: "flowers",
    image: "/store-products/flower-red-bouquet.webp",
    description: "Buket u crvenim tonovima kao znak ljubavi.",
    photoCredit: {
      author: "Rept0n1x",
      license: "CC BY-SA 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/User:Rept0n1x",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
  },
  {
    id: "soft-bouquet",
    name: "Nežni buket",
    category: "flowers",
    image: "/store-products/flower-soft-bouquet.webp",
    description: "Nežne ružičaste i bele nijanse.",
    photoCredit: {
      author: "Rept0n1x",
      license: "CC BY-SA 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/User:Rept0n1x",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    },
  },
  { id: "poppy", name: "Crveni mak", category: "flowers", image: "/store-products/flower-poppy.webp", description: "Jedan upečatljiv cvet kao znak sećanja." },
  {
    id: "potted-bouquet",
    name: "Buket u vazi",
    category: "flowers",
    image: "/store-products/flower-potted-bouquet.webp",
    description: "Mali buket u keramičkoj saksiji.",
    photoCredit: {
      author: "George Chernilevsky",
      license: "CC BY 4.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/User:George_Chernilevsky",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
  },
  { id: "tulips", name: "Ružičasti tulipani", category: "flowers", image: "/store-products/flower-tulips.webp", description: "Sveži tulipani u nežnim bojama." },
];

const storeSteps = ["Suvenir", "Uspomena", "Trajanje"];
const storeDurationOptions = [
  { value: "forever", label: "Zauvek", price: "€ 10", description: "Trajna uspomena" },
  { value: "30", label: "30 dana", price: "€ 2", description: "Prikaz na stranici pomena" },
  { value: "60", label: "60 dana", price: "€ 3", description: "Prikaz na stranici pomena" },
] as const;
const graveyardOfferings = {
  candles: storeProducts.filter((product) => product.category === "candles"),
  flowers: storeProducts.filter((product) => product.category === "flowers"),
};

function getMemorialOfferingItems(memorialId: number, totals: OfferingCounts) {
  return [
    ...Array.from({ length: totals.candles }, (_, index) => ({
      product: graveyardOfferings.candles[(memorialId + index * 3) % graveyardOfferings.candles.length],
      index,
    })),
    ...Array.from({ length: totals.flowers }, (_, index) => ({
      product: graveyardOfferings.flowers[(memorialId * 2 + index * 3) % graveyardOfferings.flowers.length],
      index,
    })),
  ].sort((left, right) => {
    const leftPosition = Math.sin((memorialId * 97 + left.index * 31 + (left.product.category === "flowers" ? 17 : 0)) * 12.9898);
    const rightPosition = Math.sin((memorialId * 97 + right.index * 31 + (right.product.category === "flowers" ? 17 : 0)) * 12.9898);
    return leftPosition - rightPosition;
  });
}

function isSavedOffering(value: unknown): value is {
  productId: string;
  dedication: string;
  signature: string;
  createdAt: Timestamp;
} {
  if (typeof value !== "object" || value === null) return false;
  return "productId" in value
    && typeof value.productId === "string"
    && storeProducts.some((product) => product.id === value.productId)
    && "dedication" in value
    && typeof value.dedication === "string"
    && value.dedication.length <= 180
    && "signature" in value
    && typeof value.signature === "string"
    && value.signature.length <= 60
    && "createdAt" in value
    && value.createdAt instanceof Timestamp;
}

function isGalleryPhoto(value: unknown): value is GalleryPhoto {
  if (typeof value !== "object" || value === null) return false;
  const imageIsValid = "image" in value
    && typeof value.image === "string"
    && (
      (value.image.startsWith("https://") && value.image.length <= 2048)
      || (value.image.startsWith("data:image/webp;base64,") && value.image.length <= 80_000)
    );
  return "id" in value
    && typeof value.id === "string"
    && value.id.length > 0
    && imageIsValid
    && "createdAt" in value
    && typeof value.createdAt === "number"
    && Number.isSafeInteger(value.createdAt);
}

function isGalleryData(value: unknown): value is { photos: GalleryPhoto[] } {
  return typeof value === "object"
    && value !== null
    && "photos" in value
    && Array.isArray(value.photos)
    && value.photos.length <= 10
    && value.photos.every(isGalleryPhoto);
}

async function compressGalleryImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Pregledač ne može obraditi izabranu sliku.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const quality = Math.max(0.4, 0.86 - attempt * 0.08);
      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Pregledač ne može kompresovati sliku.")),
          "image/webp",
          quality,
        );
      });
      if (image.type !== "image/webp") {
        throw new Error("Pregledač ne podržava WebP format potreban za galeriju.");
      }
      if (image.size <= 1_000_000) return image;
      canvas.width = Math.round(canvas.width * 0.82);
      canvas.height = Math.round(canvas.height * 0.82);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
  } finally {
    bitmap.close();
  }
  throw new Error(`Slika „${file.name}” se ne može smanjiti ispod 1 MB.`);
}

function formatSerbianCount(count: number, one: string, few: string, other: string) {
  const form = new Intl.PluralRules("sr-Latn").select(count);
  const noun = form === "one" ? one : form === "few" ? few : other;
  return `${count} ${noun}`;
}

function formatCandleCount(count: number) {
  return formatSerbianCount(count, "upaljena svijeća", "upaljene svijeće", "upaljenih svijeća");
}

function formatFlowerCount(count: number) {
  return formatSerbianCount(count, "buket", "buketa", "buketa");
}

function isOfferingCounts(value: unknown): value is OfferingCounts {
  if (typeof value !== "object" || value === null) return false;
  return "candles" in value
    && "flowers" in value
    && typeof value.candles === "number"
    && Number.isSafeInteger(value.candles)
    && value.candles >= 0
    && typeof value.flowers === "number"
    && Number.isSafeInteger(value.flowers)
    && value.flowers >= 0;
}

function describeFirebaseError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";

  if (code === "auth/configuration-not-found" || code === "auth/operation-not-allowed") {
    return "Uključi Anonymous prijavljivanje u Firebase Console → Authentication → Sign-in method.";
  }
  if (code === "permission-denied") {
    return "Firestore je odbio pristup. Objavi pravila iz firestore.rules u Firebase Console → Firestore Database → Rules.";
  }
  return error instanceof Error ? error.message : String(error);
}

function WeatherIcon({ weather }: { weather: Weather }) {
  if (weather === "sunny") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="11" /><path d="M32 5v9m0 36v9M5 32h9m36 0h9M13 13l7 7m24 24 7 7m0-38-7 7m-24 24-7 7" /></svg>;
  }

  if (weather === "rain") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 40h29a10 10 0 0 0 1-20 16 16 0 0 0-30-3A12 12 0 0 0 18 40Z" /><path d="m23 48-3 7m17-7-3 7m17-7-3 7" /></svg>;
  }

  if (weather === "snow") {
    return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 39h29a10 10 0 0 0 1-20 16 16 0 0 0-30-3A12 12 0 0 0 18 39Z" /><path d="M22 49v9m-4-4h8m13-5v9m-4-4h8m9-5v9m-4-4h8" /></svg>;
  }

  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 37h30a10 10 0 0 0 1-20 16 16 0 0 0-30-3A12 12 0 0 0 16 37Z" /><path d="m34 38-9 13h8l-3 10 13-17h-9l4-6" /></svg>;
}

export default function Home() {
  const worldRef = useRef<HTMLElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const boardHotspotRef = useRef<HTMLButtonElement>(null);
  const gateCameraRef = useRef<HTMLDivElement>(null);
  const gateDoorsRef = useRef<HTMLDivElement>(null);
  const interiorRevealRef = useRef<HTMLDivElement>(null);
  const entryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravePageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravePageAnimationFrameRef = useRef<number | null>(null);
  const [place, setPlace] = useState<Place>("kapija");
  const [enteringPlace, setEnteringPlace] = useState<"groblje" | null>(null);
  const [sceneArrived, setSceneArrived] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("night");
  const [weather, setWeather] = useState<Weather>("sunny");
  const [isMuted, setIsMuted] = useState(true);
  const [draftTimeOfDay, setDraftTimeOfDay] = useState<TimeOfDay>("night");
  const [draftWeather, setDraftWeather] = useState<Weather>("sunny");
  const [storeCategory, setStoreCategory] = useState<StoreCategory>("candles");
  const [candleTradition, setCandleTradition] = useState<CandleTradition>("all");
  const [storeStep, setStoreStep] = useState(0);
  const [storeProductId, setStoreProductId] = useState<string | null>(null);
  const [storeMemorialId, setStoreMemorialId] = useState<number | null>(null);
  const [storeDedication, setStoreDedication] = useState("");
  const [storeSignature, setStoreSignature] = useState("");
  const [storeDuration, setStoreDuration] = useState("30");
  const [storeTermsAccepted, setStoreTermsAccepted] = useState(false);
  const memorials = startingMemorials;
  const [offeringCounts, setOfferingCounts] = useState<Record<number, OfferingCounts>>({});
  const [savedOfferings, setSavedOfferings] = useState<Record<number, SavedOffering[]>>({});
  const [galleryPhotos, setGalleryPhotos] = useState<Record<number, GalleryPhoto[]>>({});
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [selected, setSelected] = useState<Memorial | null>(null);
  const [memorialStep, setMemorialStep] = useState(0);
  const [burialPlace, setBurialPlace] = useState<MemorialBurialPlace | null>(null);
  const [tombstoneStyle, setTombstoneStyle] = useState<TombstoneStyle | null>(null);
  const [memorialFaith, setMemorialFaith] = useState<MemorialFaith>("unspecified");
  const [memorialImage, setMemorialImage] = useState("");
  const [cemeteryFaith, setCemeteryFaith] = useState<MemorialFaithFilter>("all");
  const [gravePage, setGravePage] = useState(0);
  const [gravePageTransition, setGravePageTransition] = useState<{
    from: number;
    to: number;
    direction: "next" | "previous";
    phase: "prepare" | "moving";
  } | null>(null);
  const [query, setQuery] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [alternateName, setAlternateName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [deathDate, setDeathDate] = useState("");
  const [gender, setGender] = useState<"female" | "male">("male");
  const [epitaph, setEpitaph] = useState("");
  const [notice, setNotice] = useState("");

  const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const foundMemorials = useMemo(
    () =>
      memorials.filter((memorial) =>
        memorial.name.toLocaleLowerCase("sr-Latn").includes(query.trim().toLocaleLowerCase("sr-Latn")),
      ),
    [memorials, query],
  );
  const selectedTombstoneModel = tombstoneModels.find((model) => model.id === tombstoneStyle);
  const selectedTombstoneTradition = tombstoneTraditions.find((tradition) => tradition.id === selectedTombstoneModel?.tradition);
  const storeMemorial = memorials.find((memorial) => memorial.id === storeMemorialId);
  const selectedOfferingTotals = selected
    ? {
        candles: selected.candles + (offeringCounts[selected.id]?.candles ?? 0),
        flowers: selected.flowers + (offeringCounts[selected.id]?.flowers ?? 0),
      }
    : null;
  const selectedOfferingItems = selected && selectedOfferingTotals
    ? (() => {
        const savedItems = savedOfferings[selected.id] ?? [];
        const legacyCounts = {
          candles: Math.max((offeringCounts[selected.id]?.candles ?? 0) - savedItems.filter((item) => storeProducts.find((product) => product.id === item.productId)?.category === "candles").length, 0),
          flowers: Math.max((offeringCounts[selected.id]?.flowers ?? 0) - savedItems.filter((item) => storeProducts.find((product) => product.id === item.productId)?.category === "flowers").length, 0),
        };
        const sampleItems = getMemorialOfferingItems(selected.id, {
          candles: selected.candles,
          flowers: selected.flowers,
        }).map(({ product, index }) => ({
          id: `sample-${selected.id}-${product.category}-${index}`,
          product,
          dedication: `Uspomena na ${selected.name}.`,
          signature: "Porodica",
          createdAt: 0,
        }));
        const legacyItems = getMemorialOfferingItems(selected.id + 13, legacyCounts).map(({ product, index }) => ({
          id: `legacy-${selected.id}-${product.category}-${index}`,
          product,
          dedication: "",
          signature: "Anonimno",
          createdAt: 0,
        }));
        const individualItems = savedItems.flatMap((item) => {
          const product = storeProducts.find((candidate) => candidate.id === item.productId);
          return product ? [{ ...item, product }] : [];
        });
        individualItems.sort((left, right) => right.createdAt - left.createdAt);
        return [...individualItems, ...legacyItems, ...sampleItems];
      })()
    : [];
  const selectedGalleryPhotos = selected
    ? [...(galleryPhotos[selected.id] ?? [])].sort((left, right) => right.createdAt - left.createdAt)
    : [];

  function startNewMemorial() {
    setMemorialStep(0);
    setBurialPlace(null);
    setTombstoneStyle(null);
    setFirstName("");
    setLastName("");
    setAlternateName("");
    setBirthDate("");
    setDeathDate("");
    setGender("male");
    setMemorialFaith("unspecified");
    setMemorialImage("");
    setEpitaph("");
    setNotice("");
    setPanel("create");
  }

  function createMemorial() {
    if (!burialPlace || !tombstoneStyle || !firstName.trim() || !lastName.trim() || !deathDate) return;
    const model = tombstoneModels.find((item) => item.id === tombstoneStyle);
    const details = [
      `Ime i prezime: ${name}`,
      alternateName.trim() ? `Poznat/a kao: ${alternateName.trim()}` : "",
      `Datum rođenja: ${birthDate || "nije naveden"}`,
      `Datum smrti: ${deathDate}`,
      `Pol: ${gender === "female" ? "ženski" : "muški"}`,
      `Vera: ${memorialFaiths.find((faith) => faith.id === memorialFaith)?.label ?? "nije navedena"}`,
      `Model spomenika: ${model?.label ?? tombstoneStyle}`,
      `Posveta: ${epitaph.trim() || "Zauvek u našim srcima."}`,
      memorialImage ? "Fotografija je izabrana u obrascu; priložite je ručno uz ovaj mejl." : "",
    ].filter(Boolean);
    const subject = encodeURIComponent(`Zahtjev za objavu pomena: ${name}`);
    const body = encodeURIComponent([
      "Poštovani administratore,",
      "",
      "Molim da pregledate podatke ispod i odlučite da li da se pomen objavi na Digitalnom groblju.",
      "",
      ...details,
      "",
      "Ova prijava nije objavljena. Potrebno je ručno pregledati i odobriti zahtjev.",
    ].join("\n"));
    setPanel(null);
    setNotice("Otvara se mejl-nacrt administratoru. Pomen nije objavljen; fotografiju dodajte ručno kao prilog.");
    window.location.href = `mailto:djurovicandrija21@gmail.com?subject=${subject}&body=${body}`;
  }

  async function shareMemorial(memorial: Memorial) {
    const shareData = {
      title: `Uspomena na ${memorial.name}`,
      text: memorial.epitaph,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setNotice("Veza do uspomene je kopirana.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice("Dijeljenje nije uspjelo. Pokušajte ponovo.");
    }
  }

  function showPlace(nextPlace: Place, arrivedThroughGate = false) {
    if (entryTimerRef.current) {
      clearTimeout(entryTimerRef.current);
      entryTimerRef.current = null;
    }
    setEnteringPlace(null);
    setSceneArrived(nextPlace === "groblje" || arrivedThroughGate);
    setPlace(nextPlace);
    setCemeteryFaith("all");
    setGravePage(0);
    cancelGravePageTransition();
    setPanel(null);
    setSelected(null);
    setNotice("");
  }

  function enterThroughGate() {
    if (enteringPlace || entryTimerRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      showPlace("groblje");
      return;
    }

    setEnteringPlace("groblje");
    entryTimerRef.current = setTimeout(() => {
      entryTimerRef.current = null;
      showPlace("groblje", true);
    }, 2400);
  }

  function openWeatherPanel() {
    setDraftTimeOfDay(timeOfDay);
    setDraftWeather(weather);
    setPanel("weather");
  }

  const selectedPlace = places.find((item) => item.id === place);
  const selectedYears = selected?.years.split("—").map((year) => year.trim()) ?? [];
  const visibleMemorials = memorials.filter((memorial) =>
    place === "groblje" && (cemeteryFaith === "all" || memorial.faith === cemeteryFaith),
  );
  const gravePageCount = Math.max(1, Math.ceil(visibleMemorials.length / GRAVES_PER_PAGE));
  const pageStart = gravePage * GRAVES_PER_PAGE;
  const gravePageAnchor = gravePageTransition?.phase === "prepare" ? gravePageTransition.from : gravePage;
  const gravePageFirst = Math.max(0, Math.min(
    gravePageTransition?.from ?? gravePage,
    gravePageTransition?.to ?? gravePage,
  ) - 1);
  const gravePageLast = Math.min(gravePageCount - 1, Math.max(
    gravePageTransition?.from ?? gravePage,
    gravePageTransition?.to ?? gravePage,
  ) + 1);
  const displayedGravePages = Array.from(
    { length: gravePageLast - gravePageFirst + 1 },
    (_, index) => gravePageFirst + index,
  );
  const visibleStoreProducts = storeProducts.filter((product) =>
    product.category === storeCategory
    && (storeCategory !== "candles" || candleTradition === "all" || product.tradition === candleTradition),
  );

  function openStore() {
    setStoreCategory("candles");
    setCandleTradition("all");
    setStoreStep(0);
    setStoreProductId(null);
    setStoreMemorialId(null);
    setStoreDedication("");
    setStoreSignature("");
    setStoreDuration("30");
    setStoreTermsAccepted(false);
    setNotice("");
    setPanel("store");
  }

  function changeGravePage(direction: "next" | "previous") {
    if (gravePageTransition) return;
    const nextPage = gravePage + (direction === "next" ? 1 : -1);
    if (nextPage < 0 || nextPage >= gravePageCount) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setGravePageTransition({ from: gravePage, to: nextPage, direction, phase: reducedMotion ? "moving" : "prepare" });
    setGravePage(nextPage);
    if (!reducedMotion) {
      gravePageAnimationFrameRef.current = requestAnimationFrame(() => {
        gravePageAnimationFrameRef.current = requestAnimationFrame(() => {
          gravePageAnimationFrameRef.current = null;
          setGravePageTransition((current) => current ? { ...current, phase: "moving" } : current);
        });
      });
    }
    gravePageTimerRef.current = setTimeout(() => {
      gravePageTimerRef.current = null;
      setGravePageTransition(null);
    }, reducedMotion ? 20 : 1160);
  }

  function cancelGravePageTransition() {
    setGravePageTransition(null);
    if (gravePageAnimationFrameRef.current !== null) {
      cancelAnimationFrame(gravePageAnimationFrameRef.current);
      gravePageAnimationFrameRef.current = null;
    }
    if (gravePageTimerRef.current) {
      clearTimeout(gravePageTimerRef.current);
      gravePageTimerRef.current = null;
    }
  }

  function openStoreFor(memorial: Memorial, product?: StoreProduct) {
    setStoreCategory(product?.category ?? "candles");
    setCandleTradition(product?.tradition ?? "all");
    setStoreStep(product ? 1 : 0);
    setStoreProductId(product?.id ?? null);
    setStoreMemorialId(memorial.id);
    setStoreDedication("");
    setStoreSignature("");
    setStoreDuration("30");
    setStoreTermsAccepted(false);
    setNotice("");
    setSelected(null);
    setPanel("store");
  }

  async function advanceStore() {
    if (storeStep === 0 && !storeProductId) {
      setNotice("Izaberite poklon pre nego što nastavite.");
      return;
    }
    if (storeStep === 1 && storeMemorialId === null) {
      setNotice("Izaberite kome je namenjen poklon.");
      return;
    }
    if (storeStep === storeSteps.length - 1) {
      if (!storeTermsAccepted) {
        setNotice("Prihvatite uslove korišćenja pre nego što sačuvate izbor.");
        return;
      }
      const product = storeProducts.find((item) => item.id === storeProductId);
      if (!product || !storeMemorial) {
        setNotice("Izaberite suvenir i uspomenu pre nego što sačuvate izbor.");
        return;
      }
      try {
        const { db } = getFirebaseServices();
        const offeringRef = doc(db, "memorialOfferings", String(storeMemorial.id));
        const offeringEntryRef = doc(collection(db, "memorialOfferings", String(storeMemorial.id), "items"));
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(offeringRef);
          if (snapshot.exists()) {
            transaction.update(offeringRef, product.category, increment(1));
          } else {
            transaction.set(offeringRef, {
              candles: product.category === "candles" ? 1 : 0,
              flowers: product.category === "flowers" ? 1 : 0,
            });
          }
          transaction.set(offeringEntryRef, {
            productId: product.id,
            dedication: storeDedication.trim(),
            signature: storeSignature.trim(),
            createdAt: serverTimestamp(),
          });
        });
      } catch (error) {
        setNotice(`Poklon nije sačuvan. ${describeFirebaseError(error)}`);
        return;
      }
      setPanel(null);
      setNotice("Poklon je dodat uspomeni. Plaćanje još nije dostupno.");
      return;
    }
    setNotice("");
    setStoreStep((current) => current + 1);
  }

  async function addGalleryPhotos(files: FileList | null) {
    if (!selected || !files?.length) return;
    const memorialId = selected.id;
    const selectedFiles = Array.from(files);
    const currentPhotos = galleryPhotos[memorialId] ?? [];
    if (selectedFiles.length > 10) {
      setNotice("Odjednom možete izabrati najviše 10 slika.");
      return;
    }
    if (selectedFiles.length + currentPhotos.length > 10) {
      setNotice(`Galerija može imati najviše 10 slika. Trenutno ih ima ${currentPhotos.length}.`);
      return;
    }

    setGalleryUploading(true);
    setNotice("");
    let uploadedCount = 0;
    try {
      const { auth } = getFirebaseServices();
      await auth.authStateReady();
      if (!auth.currentUser) await signInAnonymously(auth);
      const user = auth.currentUser;
      if (!user) throw new Error("Firebase prijava nije uspjela. Pokušajte ponovo.");

      for (const file of selectedFiles) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`Fajl „${file.name}” nije slika.`);
        }
        const image = await compressGalleryImage(file);
        const formData = new FormData();
        formData.append("image", image, `${crypto.randomUUID()}.webp`);
        const response = await fetch(`/api/memorials/${memorialId}/gallery`, {
          method: "POST",
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          body: formData,
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "Server nije mogao sačuvati fotografiju.";
          throw new Error(message);
        }
        if (!isGalleryPhoto(result)) {
          throw new Error("Server je vratio neispravne podatke o fotografiji.");
        }
        setGalleryPhotos((current) => ({
          ...current,
          [memorialId]: [...(current[memorialId] ?? []), result],
        }));
        uploadedCount += 1;
      }
      setNotice("Slike su dodate u galeriju.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Nepoznata greška.";
      setNotice(`${uploadedCount > 0 ? `Dodato je ${uploadedCount} slika. ` : ""}Slike nisu dodate. ${reason}`);
    } finally {
      setGalleryUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  useEffect(() => {
    let active = true;
    const unsubscribeListeners: (() => void)[] = [];

    async function connectOfferings() {
      try {
        const { auth, db } = getFirebaseServices();
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
        if (!active) return;

        startingMemorials.forEach((memorial) => {
          const offeringRef = doc(db, "memorialOfferings", String(memorial.id));
          const unsubscribe = onSnapshot(
            offeringRef,
            (snapshot) => {
              if (!active) return;
              if (!snapshot.exists()) {
                setOfferingCounts((current) => ({
                  ...current,
                  [memorial.id]: { candles: 0, flowers: 0 },
                }));
                return;
              }

              const data: unknown = snapshot.data();
              if (!isOfferingCounts(data)) {
                setNotice(`Brojači za uspomenu „${memorial.name}” imaju neispravan format.`);
                return;
              }

              setOfferingCounts((current) => ({
                ...current,
                [memorial.id]: { candles: data.candles, flowers: data.flowers },
              }));
            },
            (error) => {
              if (active) {
                setNotice(`Ne mogu učitati brojače za uspomenu „${memorial.name}”. ${describeFirebaseError(error)}`);
              }
            },
          );
          unsubscribeListeners.push(unsubscribe);

          const entriesRef = collection(db, "memorialOfferings", String(memorial.id), "items");
          const unsubscribeEntries = onSnapshot(
            entriesRef,
            (snapshot) => {
              if (!active) return;
              const entries: SavedOffering[] = [];
              for (const item of snapshot.docs) {
                const data: unknown = item.data();
                if (!isSavedOffering(data)) {
                  setNotice(`Poklon za uspomenu „${memorial.name}” ima neispravan format.`);
                  return;
                }
                entries.push({
                  id: item.id,
                  productId: data.productId,
                  dedication: data.dedication,
                  signature: data.signature,
                  createdAt: data.createdAt.toMillis(),
                });
              }
              setSavedOfferings((current) => ({ ...current, [memorial.id]: entries }));
            },
            (error) => {
              if (active) {
                setNotice(`Ne mogu učitati poklone za uspomenu „${memorial.name}”. ${describeFirebaseError(error)}`);
              }
            },
          );
          unsubscribeListeners.push(unsubscribeEntries);
        });
      } catch (error) {
        if (active) {
          setNotice(`Povezivanje sa Firebase-om nije uspjelo. ${describeFirebaseError(error)}`);
        }
      }
    }

    void connectOfferings();
    return () => {
      active = false;
      unsubscribeListeners.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const memorialId = selected.id;
    const memorialName = selected.name;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function connectGallery() {
      try {
        const { auth, db } = getFirebaseServices();
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
        if (!active) return;

        const galleryRef = doc(db, "memorialGalleries", String(memorialId));
        unsubscribe = onSnapshot(
          galleryRef,
          (snapshot) => {
            if (!active) return;
            if (!snapshot.exists()) {
              setGalleryPhotos((current) => ({ ...current, [memorialId]: [] }));
              return;
            }
            const data: unknown = snapshot.data();
            if (!isGalleryData(data)) {
              setNotice(`Galerija za uspomenu „${memorialName}” ima neispravan format.`);
              return;
            }
            setGalleryPhotos((current) => ({ ...current, [memorialId]: data.photos }));
          },
          (error) => {
            if (active) {
              setNotice(`Ne mogu učitati galeriju za uspomenu „${memorialName}”. ${describeFirebaseError(error)}`);
            }
          },
        );
      } catch (error) {
        if (active) setNotice(`Povezivanje sa galerijom nije uspjelo. ${describeFirebaseError(error)}`);
      }
    }

    void connectGallery();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [selected]);

  useEffect(() => {
    const world = worldRef.current;
    const hotspot = boardHotspotRef.current;
    const gateCamera = gateCameraRef.current;
    const gateDoors = gateDoorsRef.current;
    const interiorReveal = interiorRevealRef.current;
    if (!world) return;

    const positionHotspot = () => {
      const { width, height } = world.getBoundingClientRect();
      const scale = Math.max(width / 1920, height / 1080);
      const imageWidth = 1920 * scale;
      const imageHeight = 1080 * scale;
      const imageLeft = (width - imageWidth) * 0.5;
      const imageTop = (height - imageHeight) * 0.53;
      if (hotspot) {
        hotspot.style.left = `${imageLeft + 239.7 * scale}px`;
        hotspot.style.top = `${imageTop + 687.35 * scale}px`;
        hotspot.style.width = `${201.45 * scale}px`;
        hotspot.style.height = `${131.75 * scale}px`;
      }
      if (gateDoors) {
        gateDoors.style.left = `${imageLeft + 794 * scale}px`;
        gateDoors.style.top = `${imageTop + 526 * scale}px`;
        gateDoors.style.width = `${316 * scale}px`;
        gateDoors.style.height = `${369 * scale}px`;
      }
      if (interiorReveal) {
        const portalLeft = imageLeft + 794 * scale;
        const portalTop = imageTop + 526 * scale;
        const portalWidth = 316 * scale;
        const portalHeight = 369 * scale;
        interiorReveal.style.setProperty("--portal-left", `${portalLeft}px`);
        interiorReveal.style.setProperty("--portal-top", `${portalTop}px`);
        interiorReveal.style.setProperty("--portal-width", `${portalWidth}px`);
        interiorReveal.style.setProperty("--portal-height", `${portalHeight}px`);
        interiorReveal.style.setProperty("--portal-radius", `${158 * scale}px`);
      }
      if (gateCamera) {
        const portalLeft = imageLeft + 794 * scale;
        const portalTop = imageTop + 526 * scale;
        const portalWidth = 316 * scale;
        const portalHeight = 369 * scale;
        const cameraScale = Math.max(width / portalWidth, height / portalHeight) * 1.15;
        gateCamera.style.transformOrigin = `${portalLeft + portalWidth / 2}px ${portalTop + portalHeight / 2}px`;
        gateCamera.style.setProperty("--camera-end-scale", `${cameraScale}`);
      }
    };

    positionHotspot();
    const observer = new ResizeObserver(positionHotspot);
    observer.observe(world);
    return () => observer.disconnect();
  }, [enteringPlace, place]);

  useEffect(() => () => {
    if (entryTimerRef.current) clearTimeout(entryTimerRef.current);
    if (gravePageTimerRef.current) clearTimeout(gravePageTimerRef.current);
    if (gravePageAnimationFrameRef.current !== null) cancelAnimationFrame(gravePageAnimationFrameRef.current);
  }, []);

  return (
    <main ref={worldRef} aria-busy={Boolean(enteringPlace)} className={`${styles.world} ${styles[`scene_${place}`]} ${styles[`time_${timeOfDay}`]} ${styles[`weather_${weather}`]} ${enteringPlace ? styles.gateOpening : ""} ${sceneArrived ? styles.sceneArrived : ""} ${panel === "create" ? styles.creatingMemorial : ""} ${panel === "store" ? styles.storeOpen : ""}`}>
      <div ref={gateCameraRef} className={`${styles.gateCamera} ${enteringPlace ? styles.gateCameraZooming : ""}`}>
        <div
          className={styles.backdrop}
          style={{ backgroundPosition: `center, center, calc(50% - ${(gravePageTransition?.phase === "prepare" ? gravePageTransition.from : gravePage) * 60}px) 53%` }}
          aria-hidden="true"
        />
        <div className={styles.mist} aria-hidden="true" />
        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.particles} aria-hidden="true" />
        <div className={styles.weatherFx} aria-hidden="true">
          {weather === "snow" && snowflakes.map((flake) => (
            <span className={styles.snowflake} key={flake.id} style={flake.style} />
          ))}
          {weather === "storm" && lightningFlashes.map((flash) => (
            <span className={styles.lightningFlash} key={flash.id} style={flash.style} />
          ))}
        </div>
        {enteringPlace && (
          <div
            ref={interiorRevealRef}
            className={`${styles.interiorReveal} ${styles.interiorRevealCemetery}`}
            aria-hidden="true"
          >
            <div className={styles.interiorRevealScene} />
          </div>
        )}
        {place === "kapija" && (
          <div ref={gateDoorsRef} className={`${styles.gateDoors} ${enteringPlace ? styles.gateDoorsOpening : ""}`} aria-hidden="true">
            <div className={`${styles.gateDoorLeaf} ${styles.gateDoorLeft}`}>
              <Image src="/gate-door-left.png" alt="" fill sizes="10vw" loading="eager" draggable={false} />
              <span className={`${styles.gateLabel} ${styles.gateLabelLeft}`}>Groblje</span>
            </div>
            <div className={`${styles.gateDoorLeaf} ${styles.gateDoorRight}`}>
              <Image src="/gate-door-right.png" alt="" fill sizes="10vw" loading="eager" draggable={false} />
              <span className={`${styles.gateLabel} ${styles.gateLabelRight}`}>Groblje</span>
            </div>
          </div>
        )}
      </div>

      <header className={styles.header}>
        <a className={styles.brand} href="#kapija" onClick={(event) => { event.preventDefault(); showPlace("kapija"); }} aria-label="Digitalno groblje — kapija">
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img"><path d="M24 24c-2-5-10-14-16-10-5 3-1 13 9 13-7 3-6 9-2 10 4 1 7-7 9-12 2 5 5 13 9 12 4-1 5-7-2-10 10 0 14-10 9-13-6-4-14 5-16 10Zm0-3c-2-4-1-8 0-11 1 3 2 7 0 11Z" /></svg>
          </span>
          <span className={styles.brandText}><strong>Digitalno groblje</strong><small>Uspomene koje traju</small></span>
        </a>

        <div className={styles.headerRight}>
          <div className={styles.utilityNav}>
            <button className={styles.newMemorial} onClick={startNewMemorial}><span aria-hidden="true">＋</span> Novi pomen</button>
            <button className={styles.mobileSearch} aria-label="Pretraži spomenike" onClick={() => { setQuery(""); setPanel("search"); }}>⌕</button>
            <button onClick={openStore}>Prodavnica</button>
            <button className={styles.storeToggle} onClick={openStore} aria-label="Prodavnica" title="Prodavnica">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16l-1 12H5L4 8Zm4 0a4 4 0 0 1 8 0" /></svg>
            </button>
            <button className={styles.weatherToggle} onClick={openWeatherPanel} aria-label="Vreme">
              <WeatherIcon weather="sunny" />
              <span className={styles.weatherMenuLabel}>Vreme</span>
            </button>
          </div>
          <div className={styles.iconNav}>
            <button aria-label="Pretraži spomenike" onClick={() => { setQuery(""); setPanel("search"); }}>⌕</button>
            <button
              aria-label={isMuted ? "Uključi zvuk" : "Isključi zvuk"}
              aria-pressed={!isMuted}
              title={isMuted ? "Uključi zvuk" : "Isključi zvuk"}
              onClick={() => setIsMuted((muted) => !muted)}
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" />
                </svg>
              )}
            </button>
            <span className={styles.language}>CG</span>
          </div>
        </div>

        <nav className={styles.placeNav} aria-label="Delovi digitalnog groblja">
          {places.map((item, index) => (
            <span className={styles.navItem} key={item.id}>
              {index > 0 && <span className={styles.separator} aria-hidden="true">|</span>}
              <button
                className={place === item.id ? styles.activeNav : ""}
                onClick={() => showPlace(item.id)}
                aria-current={place === item.id ? "page" : undefined}
              >
                {item.label}
              </button>
            </span>
          ))}
        </nav>
      </header>

      {place === "kapija" && (
        <>
          <button ref={boardHotspotRef} className={`${styles.worldLink} ${styles.boardHotspot}`} onClick={() => showPlace("tabla")} aria-label="Otvori oglasnu tablu">
            <span className={styles.srOnly}>Oglasna tabla</span>
          </button>

          <button className={`${styles.worldLink} ${styles.gateHotspot}`} onClick={enterThroughGate} aria-label="Uđi na groblje">
            <span className={styles.srOnly}>Ulaz u groblje</span>
          </button>
        </>
      )}

      {place !== "kapija" && (
        <section className={styles.exploreView} aria-live="polite">
          <div className={place === "groblje" ? styles.exploreTopline : undefined}>
            <div className={styles.exploreHeading}>
              <span className={styles.eyebrow}>Digitalno groblje</span>
              <h1>{selectedPlace?.label}</h1>
              <p>{place === "groblje" ? "Mesto za uspomene koje ostaju." : "Najnovije vesti i uspomene zajednice."}</p>
            </div>
            {place === "groblje" && (
              <div className={styles.graveyardToolbar}>
                <label htmlFor="cemetery-faith">Verska pripadnost</label>
                <select
                  id="cemetery-faith"
                  value={cemeteryFaith}
                  onChange={(event) => {
                    setCemeteryFaith(event.target.value as MemorialFaithFilter);
                    setGravePage(0);
                    cancelGravePageTransition();
                  }}
                >
                  <option value="all">Sve uspomene</option>
                  {memorialFaiths.map((faith) => <option value={faith.id} key={faith.id}>{faith.label}</option>)}
                </select>
                <span aria-live="polite">
                  {visibleMemorials.length === 0
                    ? "0 uspomena"
                    : `${pageStart + 1}–${Math.min(pageStart + GRAVES_PER_PAGE, visibleMemorials.length)} od ${visibleMemorials.length}`}
                </span>
              </div>
            )}
          </div>

          {place === "groblje" ? (
            <div className={styles.graveyard}>
              {visibleMemorials.length === 0 ? (
                <p className={styles.noGraves}>
                  {cemeteryFaith !== "all"
                    ? "Nema pomena za izabranu versku pripadnost."
                    : "Ovde još nema pomena. Možete napraviti prvi."}
                </p>
              ) : (
                <div className={styles.graveyardPages}>
                {displayedGravePages.map((page) => {
                  const pagePosition = page - gravePageAnchor;
                  const pageClasses = pagePosition === 0
                    ? styles.graveyardPageCurrent
                    : pagePosition === -1
                      ? styles.graveyardPagePrevious
                      : pagePosition === 1
                        ? styles.graveyardPageNext
                        : pagePosition < 0
                          ? styles.graveyardPageFarPrevious
                          : styles.graveyardPageFarNext;
                  const start = page * GRAVES_PER_PAGE;
                  const memorialsOnPage = visibleMemorials.slice(start, start + GRAVES_PER_PAGE);
                  return (
                    <div
                      key={page}
                      className={`${styles.graveyardPage} ${pageClasses}`}
                      aria-hidden={pagePosition !== 0}
                      inert={pagePosition !== 0}
                    >
                  {memorialsOnPage.map((memorial, index) => {
                const totals = {
                  candles: memorial.candles + (offeringCounts[memorial.id]?.candles ?? 0),
                  flowers: memorial.flowers + (offeringCounts[memorial.id]?.flowers ?? 0),
                };
                const offeringItems = getMemorialOfferingItems(memorial.id, totals);
                return (
                <div className={`${styles.graveMarker} ${styles[`grave${index + 1}`]}`} key={memorial.id}>
                  <button
                    type="button"
                    className={styles.graveTombstoneButton}
                    onClick={() => setSelected(memorial)}
                    aria-label={`Otvori pomen: ${memorial.name}`}
                  >
                    <TombstoneArtwork style={memorial.tombstoneStyle} className={styles.markerStone} cutout>
                      <TombstoneEngraving
                        name={memorial.name}
                        birthDate={memorial.birthDate}
                        deathDate={memorial.deathDate}
                        years={memorial.years}
                      />
                    </TombstoneArtwork>
                  </button>
                  <span className={styles.markerOfferings}>
                    {offeringItems.map(({ product, index }, position) => (
                      <button
                        type="button"
                        className={styles.markerOfferingButton}
                        key={`${product.id}-${index}`}
                        aria-label={`${product.category === "candles" ? "Upaljena svijeća" : "Ostavljen buket"} za ${memorial.name}`}
                        onClick={() => openStoreFor(memorial, product)}
                        style={{
                          left: `${14 + ((Math.sin((memorial.id * 97 + position * 31) * 12.9898) + 1) / 2) * 72}%`,
                          bottom: `${2 + ((Math.cos((memorial.id * 71 + position * 23) * 7.233) + 1) / 2) * 18}%`,
                          zIndex: Math.round(((Math.cos((memorial.id * 43 + position * 19) * 5.127) + 1) / 2) * 4) + 1,
                          transform: `translateX(-50%) rotate(${Math.sin((memorial.id * 53 + position * 29) * 9.17) * 12}deg)`,
                        }}
                      >
                        <Image
                          className={styles.markerOfferingImage}
                          src={product.image}
                          alt=""
                          width={64}
                          height={64}
                        />
                      </button>
                    ))}
                  </span>
                </div>
                );
                  })}
                    </div>
                  );
                })}
                </div>
              )}
              {visibleMemorials.length === 0 && (
                <button className={styles.createMarker} onClick={startNewMemorial}>＋<span>Novi pomen</span></button>
              )}
              {gravePageCount > 1 && (
                <>
                  <button
                    className={`${styles.graveyardArrow} ${styles.graveyardArrowPrevious}`}
                    aria-label="Prethodni grobovi"
                    onClick={() => changeGravePage("previous")}
                    disabled={gravePage === 0 || Boolean(gravePageTransition)}
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    className={`${styles.graveyardArrow} ${styles.graveyardArrowNext}`}
                    aria-label="Sledeći grobovi"
                    onClick={() => changeGravePage("next")}
                    disabled={gravePage >= gravePageCount - 1 || Boolean(gravePageTransition)}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </>
              )}
            </div>
          ) : place === "tabla" ? (
            <div className={styles.noticeBoard}>
              <article><span>OBAVEŠTENJE</span><h2>Dobro došli na mesto sećanja</h2><p>Ostavite sveću ili podelite uspomenu. Ovaj prostor je u izradi.</p></article>
              <article><span>POSLEDNJI POMEN</span><h2>{memorials[0]?.name}</h2><p>{memorials[0]?.epitaph}</p></article>
              <button onClick={startNewMemorial}>Dodajte pomen <b>→</b></button>
            </div>
          ) : null}
          <button className={styles.backToGate} onClick={() => showPlace("kapija")}>← Nazad na kapiju</button>
        </section>
      )}

      {panel === "create" && (
        <section className={styles.memorialWizard} aria-labelledby="memorial-wizard-title">
          <div className={styles.memorialWizardContent}>
            <div className={styles.memorialWizardTopline}>
              <h1 id="memorial-wizard-title">Novi <span>pomen</span></h1>
              <ol className={styles.memorialSteps} aria-label="Koraci za kreiranje pomena">
                {memorialSteps.map((step, index) => (
                  <li key={step} className={`${index === memorialStep ? styles.memorialStepActive : ""} ${index < memorialStep ? styles.memorialStepComplete : ""}`}>
                    <button
                      type="button"
                      onClick={() => index < memorialStep && setMemorialStep(index)}
                      disabled={index >= memorialStep}
                      aria-current={index === memorialStep ? "step" : undefined}
                    >
                      <span>{index + 1}</span>{step}
                    </button>
                  </li>
                ))}
              </ol>
              <button className={styles.memorialWizardClose} aria-label="Zatvori kreiranje pomena" onClick={() => setPanel(null)}>×</button>
            </div>

            <div className={styles.memorialWizardBody}>
              {memorialStep === 0 && (
                <>
                  <h2>Mesto sahrane</h2>
                  <div className={styles.burialPlaceGrid}>
                    <button type="button" onClick={() => { setBurialPlace("cemetery"); setMemorialStep(1); }}>
                      <svg viewBox="0 0 120 140" aria-hidden="true"><path d="M60 10v34m-16-24h32M60 44c-15 0-25 12-25 27v28c-18 5-27 11-27 21h104c0-10-9-16-27-21V71c0-15-10-27-25-27Zm-18 34h36M42 91h36M47 102h26" /></svg>
                      <span>Gradsko groblje</span>
                    </button>
                    <button type="button" onClick={() => { setBurialPlace("family"); setMemorialStep(1); }}>
                      <svg viewBox="0 0 120 140" aria-hidden="true"><path d="M60 20v28m-13-15h26M38 51 18 62l19 34m45-45 20 11-19 34M42 59l12 21m24-21L66 80M30 92h60v24H30zm20 0V54a10 10 0 0 1 10-10 10 10 0 0 1 10 10v38m-25 24h30" /></svg>
                      <span>Porodična grobnica</span>
                    </button>
                  </div>
                </>
              )}

              {memorialStep === 1 && (
                <>
                  <h2>Izaberite hrišćanski spomenik</h2>
                  <div className={styles.tombstoneCatalog}>
                    {tombstoneTraditions
                      .map((tradition) => {
                        const models = tombstoneModels.filter((model) => model.tradition === tradition.id);
                        return (
                          <section className={styles.tombstoneGroup} key={tradition.id} aria-labelledby={`tombstone-group-${tradition.id}`}>
                            <h3 id={`tombstone-group-${tradition.id}`}>{tradition.label}<span>{models.length} modela</span></h3>
                            <div className={styles.tombstoneGrid}>
                              {models.map((model) => (
                                <div className={styles.tombstoneCard} key={model.id}>
                                  <button
                                    type="button"
                                    className={tombstoneStyle === model.id ? styles.tombstoneSelected : ""}
                                    aria-pressed={tombstoneStyle === model.id}
                                    onClick={() => {
                                      setTombstoneStyle(model.id);
                                      setMemorialFaith(model.faith);
                                    }}
                                  >
                                    <TombstoneArtwork style={model.id} className={styles.tombstoneCardArtwork} />
                                    <b>{model.label}</b>
                                    <small>{tombstoneVariants.find((variant) => variant.id === model.variant)?.label}</small>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                  </div>
                </>
              )}

              {memorialStep === 2 && (
                <>
                  <h2>Podaci o preminulom</h2>
                  <div className={styles.memorialPersonEditor}>
                    <figure className={styles.memorialStonePreview} aria-label={`Živi prikaz spomenika za ${name.trim() || "ime i prezime"}`}>
                      <div className={styles.memorialStonePreviewScene}>
                        {tombstoneStyle && <TombstoneArtwork style={tombstoneStyle} className={styles.memorialStonePreviewArtwork}>
                          <TombstoneEngraving
                            name={name.trim() || "Ime i prezime"}
                            birthDate={birthDate || undefined}
                            deathDate={deathDate || undefined}
                          />
                        </TombstoneArtwork>}
                      </div>
                      <figcaption>Pregled spomenika uživo</figcaption>
                    </figure>
                    <div className={`${styles.memorialWizardForm} ${styles.memorialPersonForm}`}>
                      <label>Ime*<input autoFocus required value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Ime osobe" /></label>
                      <label>Prezime*<input required value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Prezime osobe" /></label>
                      <label>Drugo ime / poznat/a kao<input value={alternateName} onChange={(event) => setAlternateName(event.target.value)} placeholder="Opciono" /></label>
                      <label>Datum rođenja<input type="date" min="0001-01-01" max="9999-12-31" value={birthDate} onChange={(event) => setBirthDate(limitDateYear(event.target.value))} /></label>
                      <label>Datum smrti*<input type="date" required min="0001-01-01" max="9999-12-31" value={deathDate} onChange={(event) => setDeathDate(limitDateYear(event.target.value))} /></label>
                      <label>Pol
                        <select value={gender} onChange={(event) => setGender(event.target.value as "female" | "male")}>
                          <option value="female">Ženski</option>
                          <option value="male">Muški</option>
                        </select>
                      </label>
                      <label>Verska pripadnost (opciono)
                        <select value={memorialFaith} onChange={(event) => setMemorialFaith(event.target.value as MemorialFaith)}>
                          {memorialFaiths.map((faith) => <option value={faith.id} key={faith.id}>{faith.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {memorialStep === 3 && (
                <>
                  <h2>Fotografija za uspomenu</h2>
                  <label className={styles.memorialImageUpload}>
                    <span aria-hidden="true">＋</span>
                    <b>{memorialImage ? "Fotografija je dodata" : "Dodajte fotografiju (opciono)"}</b>
                    <small>Izaberite JPG, PNG ili WebP sliku do 5 MB.</small>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
                          setNotice("Izaberite JPG, PNG ili WebP sliku manju od 5 MB.");
                          event.target.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            setMemorialImage(reader.result);
                            setNotice("");
                          } else {
                            setNotice("Fotografija nije mogla da se učita. Pokušajte ponovo.");
                          }
                        };
                        reader.onerror = () => setNotice("Fotografija nije mogla da se učita. Pokušajte ponovo.");
                        reader.readAsDataURL(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    {memorialImage && <Image src={memorialImage} alt="Pregled fotografije za pomen" width={160} height={170} unoptimized />}
                  </label>
                  {memorialImage && <button className={styles.removeMemorialImage} onClick={() => setMemorialImage("")}>Ukloni fotografiju</button>}
                </>
              )}

              {memorialStep === 4 && (
                <>
                  <h2>Sećanje i posveta</h2>
                  <label className={styles.memorialMemoryField}>Nekoliko reči o uspomeni
                    <textarea value={epitaph} onChange={(event) => setEpitaph(event.target.value)} placeholder="Zauvek u našim srcima..." rows={5} />
                  </label>
                </>
              )}

              {memorialStep === 5 && (
                <>
                  <h2>Pregled pomena</h2>
                  <dl className={styles.memorialSummary}>
                    <div><dt>Mesto</dt><dd>{burialPlace === "cemetery" ? "Gradsko groblje" : "Porodična grobnica"}</dd></div>
                    <div>
                      <dt>Spomenik</dt>
                      <dd>{selectedTombstoneModel && selectedTombstoneTradition ? `${selectedTombstoneModel.label} · ${selectedTombstoneTradition.label}` : "Nije izabran"}</dd>
                    </div>
                    <div><dt>Ime</dt><dd>{name}</dd></div>
                    <div><dt>Drugo ime</dt><dd>{alternateName || "Nije navedeno"}</dd></div>
                    <div><dt>Datum rođenja</dt><dd>{birthDate || "Nije naveden"}</dd></div>
                    <div><dt>Datum smrti</dt><dd>{deathDate}</dd></div>
                    <div><dt>Pol</dt><dd>{gender === "female" ? "Ženski" : "Muški"}</dd></div>
                    <div><dt>Verska pripadnost</dt><dd>{memorialFaiths.find((faith) => faith.id === memorialFaith)?.label}</dd></div>
                    <div><dt>Fotografija</dt><dd>{memorialImage ? "Dodata" : "Nije dodata"}</dd></div>
                    <div><dt>Posveta</dt><dd>{epitaph || "Zauvek u našim srcima."}</dd></div>
                  </dl>
                </>
              )}
            </div>

            {memorialStep > 0 && (
              <>
                <div className={styles.memorialWizardActions}>
                  <button type="button" onClick={() => setMemorialStep((current) => current - 1)}>
                    <span aria-hidden="true">←</span> Nazad
                  </button>
                  {memorialStep < memorialSteps.length - 1 ? (
                    <button
                      type="button"
                      className={styles.memorialWizardNext}
                      disabled={memorialStep === 1 && !tombstoneStyle}
                      onClick={() => {
                        if (memorialStep === 1 && !tombstoneStyle) {
                          setNotice("Izaberite model spomenika pre nego što nastavite.");
                          return;
                        }
                        if (memorialStep === 2 && (!firstName.trim() || !lastName.trim() || !deathDate)) {
                          setNotice("Unesite ime, prezime i datum smrti pre nego što nastavite.");
                          return;
                        }
                        setNotice("");
                        setMemorialStep((current) => current + 1);
                      }}
                    >
                      Nastavi <span aria-hidden="true">→</span>
                    </button>
                  ) : (
                    <button type="button" className={styles.memorialWizardNext} disabled={!burialPlace || !tombstoneStyle || !firstName.trim() || !lastName.trim() || !deathDate} onClick={createMemorial}>
                      Pošalji zahtev <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
                <p className={styles.memorialWizardNote}>Zahtev se otvara kao mejl-nacrt administratoru. Pomen nije objavljen dok ga administrator ručno ne odobri. Fotografiju priložite ručno uz mejl.</p>
              </>
            )}
          </div>
        </section>
      )}

      {panel === "store" && (
        <section className={styles.storePage} aria-labelledby="store-title">
          <div className={styles.storeContent}>
            <div className={styles.storeTopline}>
              <h1 id="store-title"><span>Prodavnica:</span> uspomene</h1>
              <ol className={styles.storeSteps} aria-label="Koraci za izbor poklona">
                {storeSteps.map((step, index) => (
                  <li key={step} className={index === storeStep ? styles.storeStepActive : index < storeStep ? styles.storeStepComplete : ""}>
                    <button type="button" onClick={() => setStoreStep(index)} disabled={index > storeStep || (index === 2 && storeMemorialId === null)} aria-current={index === storeStep ? "step" : undefined}>
                      <span>{index + 1}</span>{step}
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            <div className={styles.storeStepContent}>
              <div className={styles.storeStepHeading}>
                <h2>{storeStep === 0 ? "Izaberite svijeću, cvijeće ili kamen" : storeStep === 1 ? "Napišite uspomenu ili posvetu" : "Izaberite trajanje poklona"}</h2>
                <p>Korak {storeStep + 1} od {storeSteps.length}</p>
              </div>

              {storeStep === 0 && (
                <div className={styles.storeCatalog}>
                  <nav className={styles.storeCategories} aria-label="Kategorije poklona">
                    {storeCategories.map((category) => (
                      <button
                        type="button"
                        key={category.id}
                        className={storeCategory === category.id ? styles.storeCategoryActive : ""}
                        aria-pressed={storeCategory === category.id}
                        onClick={() => { setStoreCategory(category.id); setCandleTradition("all"); setStoreProductId(null); setNotice(""); }}
                      >
                        {category.label}
                      </button>
                    ))}
                  </nav>
                  <div className={styles.storeListing}>
                    {storeCategory === "candles" && (
                      <nav className={styles.candleTraditions} aria-label="Verske tradicije sveća">
                        {candleTraditions.map((tradition) => (
                          <button
                            type="button"
                            key={tradition.id}
                            className={candleTradition === tradition.id ? styles.storeCategoryActive : ""}
                            aria-pressed={candleTradition === tradition.id}
                            onClick={() => { setCandleTradition(tradition.id); setStoreProductId(null); setNotice(""); }}
                          >
                            {tradition.label}
                          </button>
                        ))}
                      </nav>
                    )}
                    <div className={styles.storeProducts}>
                      {visibleStoreProducts.map((product) => (
                        <article
                          key={product.id}
                          className={`${styles.storeProduct} ${storeProductId === product.id ? styles.storeProductSelected : ""}`}
                        >
                          <button
                            type="button"
                            className={styles.storeProductButton}
                            aria-pressed={storeProductId === product.id}
                            onClick={() => { setStoreProductId(product.id); setNotice(""); }}
                          >
                            <span className={`${styles.productArtwork} ${product.category === "candles" ? styles.candleArtwork : ""}`}>
                              <Image
                                src={product.image}
                                alt=""
                                fill
                                sizes="(max-width: 700px) 45vw, (max-width: 1100px) 22vw, 240px"
                              />
                            </span>
                            <span className={styles.productDetails}>
                              <b>{product.name}</b>
                              <small>{product.description}</small>
                              {product.category === "candles" && product.tradition && (
                                <span className={styles.productTradition}>
                                  {candleTraditions.find((tradition) => tradition.id === product.tradition)?.label}
                                </span>
                              )}
                              <em>Virtuelni poklon</em>
                            </span>
                          </button>
                          <span className={styles.productCredit}>
                            Izdvojeni model{product.photoCredit ? " · prilagođena fotografija" : ""}
                            {product.photoCredit && (
                              <>
                                {" · Foto: "}
                                <a href={product.photoCredit.sourceUrl} target="_blank" rel="noreferrer">{product.photoCredit.author}</a>
                                {" · "}
                                <a href={product.photoCredit.licenseUrl} target="_blank" rel="noreferrer">{product.photoCredit.license}</a>
                              </>
                            )}
                          </span>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {storeStep === 1 && (
                <div className={styles.storeMemoryEditor}>
                  <aside className={styles.storeMemorySide} aria-label="Izaberite uspomenu">
                    {storeMemorial && (
                      <>
                        <div className={styles.storePersonCard}>
                          <b>{storeMemorial.name}</b>
                          <small>Rođen/a: {formatTombstoneDate(storeMemorial.birthDate) ?? storeMemorial.years.split("—")[0].trim()}</small>
                          <small>Preminuo/la: {formatTombstoneDate(storeMemorial.deathDate) ?? storeMemorial.years.split("—")[1]?.trim()}</small>
                          <label>
                            Izaberite uspomenu
                            <select value={storeMemorial.id} onChange={(event) => setStoreMemorialId(Number(event.target.value))}>
                              {memorials.map((memorial) => <option value={memorial.id} key={memorial.id}>{memorial.name}</option>)}
                            </select>
                          </label>
                        </div>
                        <figure className={styles.storeMemorialFigure}>
                          <TombstoneArtwork style={storeMemorial.tombstoneStyle} className={styles.storeMemorialArtwork} cutout>
                            <TombstoneEngraving
                              name={storeMemorial.name}
                              birthDate={storeMemorial.birthDate}
                              deathDate={storeMemorial.deathDate}
                              years={storeMemorial.years}
                            />
                          </TombstoneArtwork>
                        </figure>
                      </>
                    )}
                    {!storeMemorial && (
                      <div className={styles.storeMemorials}>
                        {memorials.map((memorial) => (
                          <button
                            type="button"
                            key={memorial.id}
                            aria-pressed={storeMemorialId === memorial.id}
                            onClick={() => { setStoreMemorialId(memorial.id); setNotice(""); }}
                          >
                            <b>{memorial.name}</b>
                            <small>Rođen/a: {memorial.birthDate ?? memorial.years.split("—")[0].trim()}</small>
                            <small>Preminuo/la: {memorial.deathDate ?? memorial.years.split("—")[1]?.trim()}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </aside>
                  <div className={styles.storeMemoryForm}>
                    <label className={styles.storeDedication}>
                      Uspomena ili posveta <span>Neobavezno</span>
                      <textarea value={storeDedication} onChange={(event) => setStoreDedication(event.target.value)} placeholder="Uspomena na preminulog..." maxLength={180} />
                      <small>{storeDedication.length}/180</small>
                    </label>
                    <label className={styles.storeSignature}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z" /><path d="m14.8 5.7 3.5 3.5" /></svg>
                      <input value={storeSignature} onChange={(event) => setStoreSignature(event.target.value)} placeholder="Vaš potpis" maxLength={60} />
                    </label>
                  </div>
                </div>
              )}

              {storeStep === 2 && (
                <div className={styles.storeReview}>
                  <div className={styles.storeDurations} role="radiogroup" aria-label="Trajanje poklona">
                    {storeDurationOptions.map((option) => (
                      <button type="button" key={option.value} role="radio" aria-checked={storeDuration === option.value} className={storeDuration === option.value ? styles.storeDurationSelected : ""} onClick={() => setStoreDuration(option.value)}>
                        <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" /><path d="M32 17v16l11 7M32 4v5m0 46v5M4 32h5m46 0h5M12 12l4 4m32 32 4 4m0-40-4 4m-32 32-4 4" /></svg>
                        <span>{option.label}</span>
                        <small>{option.description}</small>
                        <b>{option.price}</b>
                      </button>
                    ))}
                  </div>
                  <div className={styles.storeOrderSummary}>
                    <span>Suvenir <b>{storeProducts.find((product) => product.id === storeProductId)?.name}</b></span>
                    <span>Za <b>{storeMemorial?.name}</b></span>
                    {storeSignature && <span>Potpis <b>{storeSignature}</b></span>}
                  </div>
                  <aside className={styles.storePaymentInfo}>
                    <span aria-hidden="true">i</span>
                    <p>Izabrani suvenir i posveta prikazivali bi se uz odabranu uspomenu. U ovom probnom prikazu plaćanje nije dostupno.</p>
                  </aside>
                  <label className={styles.storeTerms}>
                    <input type="checkbox" checked={storeTermsAccepted} onChange={(event) => setStoreTermsAccepted(event.target.checked)} />
                    <span>Prihvatam <a href="mailto:djurovicandrija21@gmail.com?subject=Uslovi%20kori%C5%A1%C4%87enja">Uslove korišćenja</a> <b>*</b></span>
                  </label>
                </div>
              )}

              <div className={styles.storeActions}>
                {storeStep > 0 && <button type="button" className={styles.storeBack} onClick={() => setStoreStep((current) => current - 1)}>← Nazad</button>}
                <button type="button" className={styles.storeNext} onClick={advanceStore}>{storeStep === storeSteps.length - 1 ? "Sačuvaj izbor" : "Dalje"} <span>›</span></button>
              </div>
              <p className={styles.storeDisclaimer}>Ovo je probni prikaz prodavnice. Kupovina i plaćanje još nisu aktivni.</p>
            </div>
          </div>
          <button className={styles.storeClose} type="button" aria-label="Zatvori prodavnicu" onClick={() => setPanel(null)}>×</button>
        </section>
      )}

      <footer className={styles.footer}>
        <nav aria-label="Informacije">
          <button onClick={() => showPlace("tabla")} aria-current={place === "tabla" ? "page" : undefined}>O nama</button><i />
          <a href="mailto:djurovicandrija21@gmail.com?subject=Uslovi%20kori%C5%A1%C4%87enja">Uslovi korišćenja</a><i />
          <a href="mailto:djurovicandrija21@gmail.com?subject=Privatnost">Privatnost</a><i />
          <button onClick={openStore} aria-current={panel === "store" ? "page" : undefined}>Cjenovnik</button><i />
          <a href="mailto:djurovicandrija21@gmail.com">Kontakt</a>
        </nav>
        <p>© 2026 Digitalno groblje <span>·</span> Uspomene koje traju</p>
        <div className={styles.photoCredits}>
          <a className={styles.photoCredit} href="https://commons.wikimedia.org/wiki/File:Lebanon_Cemetery_Entrance_Arch.jpg" target="_blank" rel="noreferrer">Kapija · Nyttend · Public domain</a>
          <a className={styles.photoCredit} href="https://commons.wikimedia.org/wiki/File:Old_wooden_door_Segovia_Spain.jpg" target="_blank" rel="noreferrer">Vrata · Wikimedia · CC0</a>
          <a className={styles.photoCredit} href="https://commons.wikimedia.org/wiki/File:City_of_London_Cemetery_-_Church_Avenue_east_side.jpg" target="_blank" rel="noreferrer">Groblje · Acabashi · prilagođena · CC BY-SA 4.0</a>
        </div>
      </footer>

      {panel && panel !== "store" && panel !== "create" && (
        <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <section className={`${styles.dialog} ${panel === "weather" ? styles.weatherDialog : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className={styles.closeButton} aria-label="Zatvori" onClick={() => setPanel(null)}>×</button>
            {panel === "search" && (
              <>
                <span className={styles.eyebrow}>Pronađite uspomenu</span>
                <h2 id="dialog-title">Pretraga spomenika</h2>
                <input className={styles.dialogSearch} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Unesite ime..." />
                <div className={styles.searchResults}>
                  {foundMemorials.map((memorial) => (
                    <button key={memorial.id} onClick={() => {
                      setSelected(memorial);
                      setPanel(null);
                      setCemeteryFaith("all");
                      setPlace("groblje");
                      const memorialIndex = memorials.findIndex((item) => item.id === memorial.id);
                      setGravePage(Math.floor(memorialIndex / GRAVES_PER_PAGE));
                      cancelGravePageTransition();
                    }}>
                      <span><b>{memorial.name}</b><small>{memorial.years}</small></span><span>→</span>
                    </button>
                  ))}
                  {foundMemorials.length === 0 && <p>Nema rezultata za „{query}”.</p>}
                </div>
              </>
            )}
            {panel === "weather" && (
              <div className={styles.weatherSettings}>
                <span className={styles.eyebrow}>Podešavanje scene</span>
                <h2 id="dialog-title">Vreme i doba dana</h2>
                <fieldset className={styles.weatherGroup}>
                  <legend>Doba dana</legend>
                  <div className={styles.settingOptions}>
                    {(["day", "night"] as const).map((option) => (
                      <button
                        className={`${styles.settingOption} ${styles[`timeOption_${option}`]} ${draftTimeOfDay === option ? styles.settingOptionSelected : ""}`}
                        key={option}
                        type="button"
                        aria-pressed={draftTimeOfDay === option}
                        onClick={() => setDraftTimeOfDay(option)}
                      >
                        <svg viewBox="0 0 64 64" aria-hidden="true">
                          {option === "day"
                            ? <><circle cx="32" cy="32" r="12" /><path d="M32 5v9m0 36v9M5 32h9m36 0h9M13 13l7 7m24 24 7 7m0-38-7 7m-24 24-7 7" /></>
                            : <><path d="M40 12a21 21 0 1 0 13 36A23 23 0 0 1 40 12Z" /><path d="m49 8 1.5 4.5L55 14l-4.5 1.5L49 20l-1.5-4.5L43 14l4.5-1.5L49 8Zm9 18 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z" /></>}
                        </svg>
                        <span>{option === "day" ? "Dan" : "Noć"}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className={styles.weatherGroup}>
                  <legend>Vremenski uslovi</legend>
                  <div className={styles.settingOptions}>
                    {([
                      ["sunny", "Sunčano"],
                      ["rain", "Kiša"],
                      ["snow", "Sneg"],
                      ["storm", "Oluja"],
                    ] as const).map(([option, label]) => (
                      <button
                        className={`${styles.settingOption} ${styles[`weatherOption_${option}`]} ${draftWeather === option ? styles.settingOptionSelected : ""}`}
                        key={option}
                        type="button"
                        aria-label={label}
                        aria-pressed={draftWeather === option}
                        onClick={() => setDraftWeather(option)}
                      >
                        <WeatherIcon weather={option} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <button
                  className={`${styles.dialogAction} ${styles.weatherSave}`}
                  type="button"
                  onClick={() => { setTimeOfDay(draftTimeOfDay); setWeather(draftWeather); setPanel(null); }}
                >
                  Sačuvaj i zatvori <span>→</span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {selected && (
        <div className={`${styles.overlay} ${styles.memorialOverlay}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className={styles.memorialDialog} role="dialog" aria-modal="true" aria-labelledby="memorial-title">
            <header className={styles.memorialDialogHeader}>
              <div className={styles.memorialIdentity}>
                <h2 id="memorial-title">{selected.name}</h2>
                <p>
                  <>Rođen/a: <time>{selected.birthDate ?? selectedYears[0]}</time></>
                  <span aria-hidden="true"> · </span>
                  <>Preminuo/la: <time>{selected.deathDate ?? selectedYears[1]}</time></>
                </p>
              </div>
              <div className={styles.memorialDialogActions}>
                <button className={styles.memorialCandleAction} type="button" onClick={() => openStoreFor(selected)}>
                  <span aria-hidden="true">＋</span> Upali svijeću
                </button>
                <button className={styles.memorialIconAction} type="button" aria-label="Podijeli uspomenu" onClick={() => void shareMemorial(selected)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4" /></svg>
                </button>
                <button className={styles.memorialIconAction} type="button" aria-label="Zatvori uspomenu" onClick={() => setSelected(null)}>×</button>
              </div>
            </header>
            <div className={styles.memorialDialogContent}>
              <aside className={styles.memorialPortraitColumn}>
                <div className={styles.memorialPortrait}>
                  {selected.image ? (
                    <Image src={selected.image} alt={`Fotografija: ${selected.name}`} fill sizes="(max-width: 700px) 80vw, 360px" />
                  ) : (
                    <TombstoneArtwork style={selected.tombstoneStyle} className={styles.memorialTombstone} cutout>
                      <TombstoneEngraving
                        name={selected.name}
                        birthDate={selected.birthDate}
                        deathDate={selected.deathDate}
                        years={selected.years}
                      />
                    </TombstoneArtwork>
                  )}
                </div>
                <p className={styles.memorialAccount}>Zauvijek u sjećanju</p>
              </aside>
              <div className={styles.memorialDetails}>
                <section className={styles.memorialInfoSection}>
                  <h3>Podaci o uspomeni</h3>
                  <blockquote>„{selected.epitaph}”</blockquote>
                  {selected.alternateName && <p>Poznat/a kao <b>{selected.alternateName}</b></p>}
                </section>
                <section className={styles.memorialGallerySection} aria-labelledby="memorial-gallery-title">
                  <div className={styles.memorialGalleryHeading}>
                    <div>
                      <h3 id="memorial-gallery-title">Galerija</h3>
                      <p>{selectedGalleryPhotos.length}/10 fotografija{selectedGalleryPhotos.length > 6 ? " · prikazuje se 6 najnovijih" : ""}</p>
                    </div>
                    <button
                      className={styles.memorialGalleryAdd}
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={galleryUploading || selectedGalleryPhotos.length >= 10}
                    >
                      {galleryUploading ? "Dodavanje..." : "＋ Dodaj slike"}
                    </button>
                    <input
                      ref={galleryInputRef}
                      className={styles.memorialGalleryInput}
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label="Izaberite slike za galeriju"
                      onChange={(event) => void addGalleryPhotos(event.currentTarget.files)}
                    />
                  </div>
                  {selectedGalleryPhotos.length > 0 ? (
                    <div className={styles.memorialGalleryGrid}>
                      {selectedGalleryPhotos.slice(0, 6).map((photo, index) => (
                        <Image
                          key={photo.id}
                          src={photo.image}
                          alt={`Fotografija ${index + 1} u galeriji uspomene ${selected.name}`}
                          width={320}
                          height={240}
                          unoptimized
                        />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.memorialGalleryEmpty}>Još nema fotografija. Dodajte do 10 slika u ovu galeriju.</p>
                  )}
                </section>
                <section className={styles.memorialMemorySection}>
                  <div className={styles.memorialSectionHeading}>
                    <h3>Uspomene, svijeće i cvijeće</h3>
                    <div className={styles.memorialCounts}>
                      <span className={styles.memorialCandleCount} aria-label={formatCandleCount(selectedOfferingTotals?.candles ?? 0)}>
                        <span aria-hidden="true">♨</span>{selectedOfferingTotals?.candles}
                      </span>
                      <span className={styles.memorialFlowerCount} aria-label={formatFlowerCount(selectedOfferingTotals?.flowers ?? 0)}>
                        <span aria-hidden="true">✿</span>{selectedOfferingTotals?.flowers}
                      </span>
                    </div>
                  </div>
                  <article className={styles.memorialMemory}>
                    <blockquote>„{selected.epitaph}”</blockquote>
                    <p>{selected.name}</p>
                  </article>
                  <div className={styles.memorialOfferingList} aria-label="Svijeće i cvijeće ostavljeno za ovu uspomenu">
                    {selectedOfferingItems.map(({ id, product, dedication, signature, createdAt }) => (
                      <article className={styles.memorialOfferingEntry} key={id}>
                        <Image src={product.image} alt={product.name} width={128} height={128} />
                        <div className={styles.memorialOfferingEntryText}>
                          <strong>{product.name}</strong>
                          <blockquote>{dedication || "Uspomena sačuvana u srcima."}</blockquote>
                          <p>{signature || "Anonimno"}</p>
                          {createdAt > 0 && <time dateTime={new Date(createdAt).toISOString()}>{new Date(createdAt).toLocaleDateString("sr-Latn")}</time>}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className={styles.memorialMemoryFooter}>
                    <span aria-live="polite">{formatCandleCount(selectedOfferingTotals?.candles ?? 0)} · {formatFlowerCount(selectedOfferingTotals?.flowers ?? 0)}</span>
                    <button type="button" onClick={() => openStoreFor(selected)}>＋ Upali svijeću</button>
                  </div>
                </section>
                <small className={styles.memorialDisclaimer}>Demonstracioni pomen; sadržaj je privremen.</small>
              </div>
            </div>
          </section>
        </div>
      )}

      {notice && <div className={styles.toast} role="status">{notice}<button onClick={() => setNotice("")} aria-label="Zatvori obaveštenje">×</button></div>}
    </main>
  );
}
