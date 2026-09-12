"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

declare global {
  interface Window {
    AlertaAndroid?: {
      isNativeAndroid: () => boolean;
      getFcmToken: () => string;
      areNotificationsEnabled: () => boolean;
    };
  }
}

function hasNativeAndroidBridge() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.AlertaAndroid?.isNativeAndroid === "function" &&
      window.AlertaAndroid.isNativeAndroid()
    );
  } catch {
    return false;
  }
}

async function getNativeFcmToken() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const token = window.AlertaAndroid?.getFcmToken?.()?.trim() || "";
      if (token.length >= 40) return token;
    } catch {
      // El puente puede tardar unos instantes en quedar disponible.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }

  throw new Error("No se pudo obtener el token de notificaciones del teléfono.");
}

const categories = [
  { icon: "🚨", title: "Delito / Robo", helper: "Robo, intento de robo o delito en curso", color: "bg-red-500" },
  { icon: "👤", title: "Persona sospechosa", helper: "Conducta o presencia que te genera preocupación", color: "bg-orange-500" },
  { icon: "🚗", title: "Vehículo sospechoso", helper: "Vehículo en situación inusual o sospechosa", color: "bg-yellow-500" },
  { icon: "⚠️", title: "Accidente", helper: "Siniestro vial o situación con personas heridas", color: "bg-blue-500" },
  { icon: "🔥", title: "Incendio", helper: "Fuego, humo o riesgo de propagación", color: "bg-purple-500" },
  { icon: "🆘", title: "Emergencia", helper: "Situación urgente que requiere atención inmediata", color: "bg-emerald-500" },
];

const IMPORTANT_CATEGORIES = new Set([
  "Delito / Robo",
  "Accidente",
  "Incendio",
  "Emergencia",
]);

type PublicReport = {
  id: number;
  category: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

type NearbyToast = {
  id: number;
  title: string;
  body: string;
  important: boolean;
} | null;

type NearbyPharmacy = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
};

type NearbyPoliceStation = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
};

function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function getPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60_000,
    });
  });
}

function getNotifiedIds() {
  try {
    return new Set<number>(
      JSON.parse(localStorage.getItem("alertas_notificadas") || "[]")
    );
  } catch {
    return new Set<number>();
  }
}

function saveNotifiedId(id: number) {
  const ids = getNotifiedIds();
  ids.add(id);
  localStorage.setItem(
    "alertas_notificadas",
    JSON.stringify(Array.from(ids).slice(-150))
  );
}

export default function Home() {
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [emergencyMenuOpen, setEmergencyMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pharmaciesOpen, setPharmaciesOpen] = useState(false);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false);
  const [pharmaciesError, setPharmaciesError] = useState("");
  const [nearbyPharmacies, setNearbyPharmacies] = useState<NearbyPharmacy[]>([]);
  const [pharmacySearchRadiusKm, setPharmacySearchRadiusKm] = useState(5);
  const [policeOpen, setPoliceOpen] = useState(false);
  const [policeLoading, setPoliceLoading] = useState(false);
  const [policeError, setPoliceError] = useState("");
  const [nearbyPoliceStations, setNearbyPoliceStations] = useState<NearbyPoliceStation[]>([]);
  const [policeSearchRadiusKm, setPoliceSearchRadiusKm] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [nearbyToast, setNearbyToast] = useState<NearbyToast>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const reportFormRef = useRef<HTMLDivElement | null>(null);
  const emergencyMenuRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const baselineReadyRef = useRef(false);

  function showToast(id: number, title: string, body: string, important: boolean) {
    if (getNotifiedIds().has(id)) return;
    saveNotifiedId(id);

    setNearbyToast({ id, title, body, important });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(
      () => setNearbyToast(null),
      important ? 9000 : 5500
    );

    if (important) {
      const sound = new Audio("/alerta_beep.wav");
      sound.volume = 0.85;
      void sound.play().catch(() => undefined);
      if ("vibrate" in navigator) navigator.vibrate([250, 120, 250]);
    }
  }

  async function refreshPushSubscription(lat: number, lon: number) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) throw new Error("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY.");

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        latitude: lat,
        longitude: lon,
      }),
    });

    if (!response.ok) throw new Error("No se pudo registrar el dispositivo.");
    return true;
  }

  async function refreshNativeFcmSubscription(lat: number, lon: number) {
    if (!hasNativeAndroidBridge()) {
      throw new Error("No se encontró el servicio nativo de notificaciones.");
    }

    const notificationsAllowed =
      window.AlertaAndroid?.areNotificationsEnabled?.() ?? false;

    if (!notificationsAllowed) {
      throw new Error(
        "Las notificaciones están desactivadas para Alerta Otamendi en Android."
      );
    }

    const token = await getNativeFcmToken();

    const response = await fetch("/api/fcm/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        latitude: lat,
        longitude: lon,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        data?.error || "No se pudo registrar el teléfono para recibir alertas."
      );
    }

    return true;
  }

  async function enableNotifications() {
    setNotificationBusy(true);

    try {
      if (!navigator.geolocation) {
        throw new Error("Este dispositivo no permite geolocalización.");
      }

      const nativeAndroid = hasNativeAndroidBridge();

      if (!nativeAndroid) {
        if (
          !("Notification" in window) ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        ) {
          throw new Error("Este navegador no admite notificaciones push.");
        }

        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
          throw new Error("Necesitamos permiso para enviarte alertas cercanas.");
        }
      }

      setLocationMessage("📍 Obteniendo ubicación para alertas cercanas…");

      const position = await getPosition();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      setLatitude(lat);
      setLongitude(lon);

      if (nativeAndroid) {
        await refreshNativeFcmSubscription(lat, lon);
      } else {
        await refreshPushSubscription(lat, lon);
      }

      localStorage.setItem("notificationsEnabled", "true");
      setNotificationsEnabled(true);
      setIsAndroidApp(nativeAndroid);
      setLocationMessage("✅ Alertas cercanas activadas para tu ubicación.");
      setMessage("🔔 Vas a recibir avisos importantes dentro de un radio de 5 km.");
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "No se pudieron activar las alertas.";

      setMessage(`❌ ${text}`);
    } finally {
      setNotificationBusy(false);
    }
  }

  async function disableNotifications() {
    setNotificationBusy(true);
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();

        if (subscription) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          }).catch(() => undefined);
          await subscription.unsubscribe();
        }
      }

      localStorage.setItem("notificationsEnabled", "false");
      setNotificationsEnabled(false);
      setMessage("🔕 Alertas cercanas desactivadas.");
    } finally {
      setNotificationBusy(false);
    }
  }

  async function toggleNotifications() {
    if (notificationBusy) return;
    if (notificationsEnabled) await disableNotifications();
    else await enableNotifications();
  }

  async function getLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("❌ Este dispositivo no permite geolocalización.");
      return;
    }

    setLocationMessage("📍 Obteniendo ubicación…");
    try {
      const position = await getPosition();
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
      setLocationMessage("✅ Ubicación lista para enviar la alerta.");
    } catch {
      setLocationMessage("❌ No se pudo obtener la ubicación.");
    }
  }

  useEffect(() => {
    const nativeAndroid = hasNativeAndroidBridge();
    setIsAndroidApp(nativeAndroid);

    const saved = localStorage.getItem("notificationsEnabled") === "true";
    setNotificationsEnabled(saved);

    if (!saved) return;

    if (nativeAndroid) {
      void getPosition()
        .then(async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          setLatitude(lat);
          setLongitude(lon);
          setLocationMessage("✅ Alertas cercanas activas.");

          await refreshNativeFcmSubscription(lat, lon);
        })
        .catch(() => {
          setLocationMessage(
            "⚠️ Abrí la ubicación para actualizar las alertas cercanas."
          );
        });

      return;
    }

    if ("Notification" in window && Notification.permission === "granted") {
      void getPosition()
        .then(async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          setLatitude(lat);
          setLongitude(lon);
          setLocationMessage("✅ Alertas cercanas activas.");

          await refreshPushSubscription(lat, lon);
        })
        .catch(() => {
          setLocationMessage(
            "⚠️ Abrí la ubicación para actualizar las alertas cercanas."
          );
        });
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "PUSH_ALERT") return;
      const payload = event.data.payload || {};
      const id = Number(payload.reportId);
      if (!Number.isInteger(id)) return;

      showToast(
        id,
        payload.title || "🚨 Alerta cercana",
        payload.body || "Se registró una alerta cerca tuyo.",
        payload.priority === "critical" || payload.priority === "high"
      );
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || latitude === null || longitude === null) return;

    const currentLatitude = latitude;
    const currentLongitude = longitude;
    let active = true;

    async function checkNearbyAlerts() {
      try {
        const response = await fetch("/api/reports", { cache: "no-store" });
        const data = await response.json();
        if (!active || !data.success || !Array.isArray(data.reports)) return;

        const currentReports: PublicReport[] = data.reports;

        if (!baselineReadyRef.current) {
          currentReports.forEach((report) => saveNotifiedId(report.id));
          baselineReadyRef.current = true;
          return;
        }

        for (const report of currentReports) {
          if (
            getNotifiedIds().has(report.id) ||
            report.category === "Persona sospechosa" ||
            report.category === "Vehículo sospechoso" ||
            report.latitude === null ||
            report.longitude === null ||
            ["resuelta", "descartada"].includes(report.status)
          ) {
            continue;
          }

          const distance = calcularDistanciaKm(
            currentLatitude,
            currentLongitude,
            report.latitude,
            report.longitude
          );

          if (distance <= 5) {
            const important = IMPORTANT_CATEGORIES.has(report.category);
            showToast(
              report.id,
              important ? "🚨 Alerta cercana" : "ℹ️ Aviso cerca tuyo",
              `${report.category} a aproximadamente ${distance.toFixed(1)} km de tu ubicación.`,
              important
            );
          }
        }
      } catch (error) {
        console.error("Error consultando alertas cercanas:", error);
      }
    }

    void checkNearbyAlerts();
    const interval = window.setInterval(checkNearbyAlerts, 12_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [notificationsEnabled, latitude, longitude]);

  async function openNearbyPharmacies() {
    setPharmaciesOpen(true);
    setPharmaciesLoading(true);
    setPharmaciesError("");
    setNearbyPharmacies([]);

    try {
      if (!navigator.geolocation) {
        throw new Error("Este dispositivo no permite obtener la ubicación.");
      }

      const position = await getPosition();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      const response = await fetch(
        `/api/pharmacies?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron buscar farmacias cercanas.");
      }

      setNearbyPharmacies(Array.isArray(data.pharmacies) ? data.pharmacies : []);
      setPharmacySearchRadiusKm(Number(data.radiusKm) || 5);
    } catch (error) {
      setPharmaciesError(
        error instanceof Error ? error.message : "No se pudieron buscar farmacias cercanas."
      );
    } finally {
      setPharmaciesLoading(false);
    }
  }

  async function openNearbyPoliceStations() {
    setPoliceOpen(true);
    setPoliceLoading(true);
    setPoliceError("");
    setNearbyPoliceStations([]);

    try {
      if (!navigator.geolocation) {
        throw new Error("Este dispositivo no permite obtener la ubicación.");
      }

      const position = await getPosition();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      const response = await fetch(
        `/api/police-stations?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "No se pudieron buscar comisarías cercanas.");
      }

      setNearbyPoliceStations(Array.isArray(data.stations) ? data.stations : []);
      setPoliceSearchRadiusKm(Number(data.radiusKm) || 5);
    } catch (error) {
      setPoliceError(
        error instanceof Error ? error.message : "No se pudieron buscar comisarías cercanas."
      );
    } finally {
      setPoliceLoading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudio(
          new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType })
        );
        setIsRecording(false);
        recorder.stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error al acceder al micrófono:", error);

      const errorName =
        error instanceof DOMException
          ? error.name
          : error instanceof Error
            ? error.name
            : "Error";

      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      setMessage(
        `❌ Micrófono: ${errorName} — ${errorMessage}`
      );

      setIsRecording(false);
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  function validateFile(file: File | null, maxMb: number, label: string) {
    if (!file) return true;
    if (file.size > maxMb * 1024 * 1024) {
      setMessage(`⚠️ ${label} supera el máximo de ${maxMb} MB.`);
      return false;
    }
    return true;
  }

  async function uploadMedia(file: File, folder: string) {
    const extension = file.name.split(".").pop() || "bin";
    const fileName = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("alertas").upload(fileName, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("alertas").getPublicUrl(fileName).data.publicUrl;
  }

  async function sendReport() {
    if (!selected) {
      setMessage("⚠️ Elegí primero qué está pasando.");
      return;
    }
    if (description.trim().length < 3) {
      setMessage("⚠️ Contanos brevemente qué estás observando.");
      return;
    }
    if (!validateFile(photo, 10, "La foto")) return;
    if (!validateFile(video, 50, "El video")) return;
    if (!validateFile(audio, 15, "El audio")) return;

    let reportLatitude = latitude;
    let reportLongitude = longitude;

    if (reportLatitude === null || reportLongitude === null) {
      try {
        setLocationMessage("📍 Confirmando ubicación…");
        const position = await getPosition();
        reportLatitude = position.coords.latitude;
        reportLongitude = position.coords.longitude;
        setLatitude(reportLatitude);
        setLongitude(reportLongitude);
        setLocationMessage("✅ Ubicación confirmada.");
      } catch {
        setMessage("❌ Necesitamos tu ubicación para enviar la alerta.");
        return;
      }
    }

    setSending(true);
    setMessage("");

    try {
      const imageUrl = photo ? await uploadMedia(photo, "fotos") : null;
      const videoUrl = video ? await uploadMedia(video, "videos") : null;
      const audioUrl = audio ? await uploadMedia(audio, "audios") : null;

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selected,
          description: description.trim(),
          latitude: reportLatitude,
          longitude: reportLongitude,
          imageUrl,
          videoUrl,
          audioUrl,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(`❌ ${data.message || "No se pudo enviar la alerta."}`);
        return;
      }

      if (data.report?.id) {
        const savedReports: number[] = JSON.parse(
          localStorage.getItem("mis_reportes") || "[]"
        );
        if (!savedReports.includes(data.report.id)) {
          savedReports.push(data.report.id);
          localStorage.setItem("mis_reportes", JSON.stringify(savedReports.slice(-100)));
        }
      }

      setMessage(`✅ Alerta enviada. Número de reporte: #${data.report?.id ?? ""}`);
      setDescription("");
      setSelected("");
      setPhoto(null);
      setVideo(null);
      setAudio(null);
      if (!notificationsEnabled) {
        setLatitude(null);
        setLongitude(null);
        setLocationMessage("");
      }
    } catch (error) {
      console.error("Error enviando alerta:", error);
      setMessage("❌ Error de conexión con el sistema.");
    } finally {
      setSending(false);
    }
  }

  const selectedCategory = categories.find((category) => category.title === selected);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {nearbyToast && (
        <div
          className={`fixed inset-x-3 top-3 z-[99999] mx-auto max-w-md rounded-2xl border p-4 shadow-2xl backdrop-blur ${
            nearbyToast.important
              ? "border-red-500/70 bg-red-950/95"
              : "border-slate-600 bg-slate-900/95"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">{nearbyToast.important ? "🚨" : "📍"}</div>
            <div className="min-w-0 flex-1">
              <p className="font-black">{nearbyToast.title}</p>
              <p className="mt-1 text-sm text-slate-200">{nearbyToast.body}</p>
              <button
                onClick={() => (window.location.href = "/mapa")}
                className="mt-3 text-xs font-bold text-white underline underline-offset-4"
              >
                Ver mapa de alertas
              </button>
            </div>
            <button onClick={() => setNearbyToast(null)} className="text-slate-400">✕</button>
          </div>
        </div>
      )}

      {infoOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-300">
                  Información
                </p>
                <h2 className="mt-1 text-2xl font-black">🚨 Alerta Otamendi</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Una herramienta comunitaria para comunicar y recibir información útil de forma rápida y ordenada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
                aria-label="Cerrar información"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-5 text-slate-300">
              <div className="rounded-2xl bg-slate-900 p-3">
                <p className="font-bold text-white">📱 ¿Cómo enviar un reporte?</p>
                <p className="mt-1">Elegí qué está pasando, describí brevemente la situación y obtené tu ubicación. Si es seguro, también podés adjuntar una foto, video o audio.</p>
              </div>

              <div className="rounded-2xl bg-slate-900 p-3">
                <p className="font-bold text-white">📍 Ubicación y mapa</p>
                <p className="mt-1">La ubicación permite colocar el reporte en el lugar correcto. En el mapa podés consultar situaciones recientes reportadas en la zona.</p>
              </div>

              <div className="rounded-2xl bg-slate-900 p-3">
                <p className="font-bold text-white">🔔 Alertas cercanas</p>
                <p className="mt-1">Podés activar las notificaciones para recibir avisos de situaciones importantes cercanas a tu ubicación.</p>
              </div>

              <div className="rounded-2xl bg-slate-900 p-3">
                <p className="font-bold text-white">🌦️ Alertas meteorológicas</p>
                <p className="mt-1">El sistema también puede comunicar alertas meteorológicas oficiales amarillas y rojas cuando corresponda.</p>
              </div>

              <div className="rounded-2xl bg-slate-900 p-3">
                <p className="font-bold text-white">📄 Seguimiento</p>
                <p className="mt-1">Desde “Mis reportes” podés consultar el estado de los reportes enviados desde este dispositivo.</p>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-amber-100/90">
                <p className="font-bold">⚠️ Tu seguridad es primero</p>
                <p className="mt-1">No persigas, no intervengas y no te expongas para obtener imágenes. La foto, el video y el audio son siempre opcionales.</p>
              </div>

              <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-3">
                <p className="font-bold text-white">☎️ Ante una emergencia</p>
                <p className="mt-1 text-slate-300">Alerta Otamendi no reemplaza a la Policía, Bomberos, emergencias médicas ni al 911. Si existe peligro inmediato, utilizá los servicios oficiales.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="mt-5 w-full rounded-2xl bg-red-500 py-3 font-black transition active:scale-[0.99]"
            >
              Entendido
            </button>

            <p className="mt-4 text-center text-[11px] font-semibold tracking-wider text-slate-600">
              RVS DESARROLLADOR
            </p>
          </div>
        </div>
      )}

      {policeOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setPoliceOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-300">
                  Cerca de tu ubicación
                </p>
                <h2 className="mt-1 text-2xl font-black">👮 Comisarías cercanas</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Se buscan automáticamente usando la ubicación de tu teléfono.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPoliceOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
                aria-label="Cerrar comisarías cercanas"
              >
                ✕
              </button>
            </div>

            {policeLoading && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
                <div className="text-3xl">📍</div>
                <p className="mt-2 font-bold">Buscando comisarías cercanas…</p>
                <p className="mt-1 text-xs text-slate-500">Esperá unos segundos mientras obtenemos tu ubicación.</p>
              </div>
            )}

            {!policeLoading && policeError && (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/30 p-4">
                <p className="font-bold text-red-200">No pudimos completar la búsqueda</p>
                <p className="mt-1 text-sm text-slate-300">{policeError}</p>
                <button
                  type="button"
                  onClick={() => void openNearbyPoliceStations()}
                  className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold"
                >
                  Reintentar
                </button>
              </div>
            )}

            {!policeLoading && !policeError && nearbyPoliceStations.length === 0 && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
                <p className="font-bold">No encontramos comisarías registradas cerca.</p>
                <p className="mt-1 text-xs text-slate-500">
                  La búsqueda se amplió hasta {policeSearchRadiusKm} km.
                </p>
              </div>
            )}

            {!policeLoading && nearbyPoliceStations.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="text-xs text-slate-500">
                  Mostrando las más cercanas dentro de {policeSearchRadiusKm} km.
                </p>

                {nearbyPoliceStations.map((station) => (
                  <div
                    key={station.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-xl">
                        👮
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-white">{station.name}</p>
                        <p className="mt-1 text-xs font-bold text-blue-300">
                          📍 A {station.distanceKm.toFixed(1)} km aprox.
                        </p>
                        {station.address && (
                          <p className="mt-1 text-xs leading-5 text-slate-400">{station.address}</p>
                        )}
                      </div>
                    </div>

                    <div className={`mt-3 grid gap-2 ${station.phone ? "grid-cols-2" : "grid-cols-1"}`}>
                      {station.phone && (
                        <a
                          href={`tel:${station.phone.replace(/[^+\d]/g, "")}`}
                          className="rounded-xl bg-slate-800 px-3 py-2 text-center text-xs font-bold"
                        >
                          ☎️ Llamar
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        className="rounded-xl bg-blue-600 px-3 py-2 text-center text-xs font-bold"
                      >
                        🧭 Cómo llegar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">
              ℹ️ Esta opción muestra dependencias policiales registradas en mapas públicos. Ante una emergencia inmediata, utilizá el 911.
            </div>

            <p className="mt-4 text-center text-[11px] font-semibold tracking-wider text-slate-600">
              RVS DESARROLLADOR
            </p>
          </div>
        </div>
      )}

      {pharmaciesOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setPharmaciesOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Cerca de tu ubicación
                </p>
                <h2 className="mt-1 text-2xl font-black">💊 Farmacias cercanas</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Se buscan automáticamente usando la ubicación de tu teléfono.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPharmaciesOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
                aria-label="Cerrar farmacias cercanas"
              >
                ✕
              </button>
            </div>

            {pharmaciesLoading && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
                <div className="text-3xl">📍</div>
                <p className="mt-2 font-bold">Buscando farmacias cercanas…</p>
                <p className="mt-1 text-xs text-slate-500">Esperá unos segundos mientras obtenemos tu ubicación.</p>
              </div>
            )}

            {!pharmaciesLoading && pharmaciesError && (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/30 p-4">
                <p className="font-bold text-red-200">No pudimos completar la búsqueda</p>
                <p className="mt-1 text-sm text-slate-300">{pharmaciesError}</p>
                <button
                  type="button"
                  onClick={() => void openNearbyPharmacies()}
                  className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold"
                >
                  Reintentar
                </button>
              </div>
            )}

            {!pharmaciesLoading && !pharmaciesError && nearbyPharmacies.length === 0 && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
                <p className="font-bold">No encontramos farmacias registradas cerca.</p>
                <p className="mt-1 text-xs text-slate-500">
                  La búsqueda se amplió hasta {pharmacySearchRadiusKm} km.
                </p>
              </div>
            )}

            {!pharmaciesLoading && nearbyPharmacies.length > 0 && (
              <div className="mt-5 space-y-3">
                <p className="text-xs text-slate-500">
                  Mostrando las más cercanas dentro de {pharmacySearchRadiusKm} km.
                </p>

                {nearbyPharmacies.map((pharmacy) => (
                  <div
                    key={pharmacy.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-xl">
                        💊
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-white">{pharmacy.name}</p>
                        <p className="mt-1 text-xs font-bold text-emerald-300">
                          📍 A {pharmacy.distanceKm.toFixed(1)} km aprox.
                        </p>
                        {pharmacy.address && (
                          <p className="mt-1 text-xs leading-5 text-slate-400">{pharmacy.address}</p>
                        )}
                      </div>
                    </div>

                    <div className={`mt-3 grid gap-2 ${pharmacy.phone ? "grid-cols-2" : "grid-cols-1"}`}>
                      {pharmacy.phone && (
                        <a
                          href={`tel:${pharmacy.phone.replace(/[^+\d]/g, "")}`}
                          className="rounded-xl bg-slate-800 px-3 py-2 text-center text-xs font-bold"
                        >
                          ☎️ Llamar
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-center text-xs font-bold"
                      >
                        🧭 Cómo llegar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">
              ℹ️ Esta opción muestra farmacias cercanas registradas en mapas públicos. No indica necesariamente cuál está de turno ni garantiza horarios de atención.
            </div>

            <p className="mt-4 text-center text-[11px] font-semibold tracking-wider text-slate-600">
              RVS DESARROLLADOR
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md px-4 pb-10 sm:px-5">
        <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between border-b border-slate-900 bg-slate-950/90 px-4 py-4 backdrop-blur sm:-mx-5 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-2xl shadow-lg shadow-red-950/40">🚨</div>
            <div>
              <h1 className="text-xl font-black tracking-tight">ALERTA OTAMENDI</h1>
              <p className="text-xs text-slate-500">Comunidad conectada</p>
            </div>
          </div>

          <button
            onClick={() => void toggleNotifications()}
            disabled={notificationBusy}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition disabled:opacity-50 ${
              notificationsEnabled
                ? "border-yellow-400 bg-yellow-500 text-slate-950"
                : "border-slate-700 bg-slate-900"
            }`}
            title={notificationsEnabled ? "Desactivar alertas cercanas" : "Activar alertas cercanas"}
          >
            {notificationBusy ? "…" : notificationsEnabled ? "🔔" : "🔕"}
          </button>
        </header>

        <section className="pt-7">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300">
              REPORTE CIUDADANO
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void openNearbyPharmacies()}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-700/50 bg-emerald-950/40 text-sm shadow-lg transition active:scale-95"
                aria-label="Buscar farmacias cercanas"
                title="Farmacias cercanas"
              >
                💊
              </button>
              <button
                type="button"
                onClick={() => void openNearbyPoliceStations()}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-700/50 bg-blue-950/40 text-sm shadow-lg transition active:scale-95"
                aria-label="Buscar comisarías cercanas"
                title="Comisarías cercanas"
              >
                👮
              </button>
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-sm font-black text-slate-200 shadow-lg transition active:scale-95"
                aria-label="Información sobre Alerta Otamendi"
                title="Cómo funciona Alerta Otamendi"
              >
                ⓘ
              </button>
            </div>
          </div>
          <h2 className="mt-3 text-3xl font-black leading-tight">¿Qué está pasando?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Elegí una opción, contanos brevemente qué ves y enviá la alerta. El centro de monitoreo recibe tu ubicación automáticamente.
          </p>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3">
          {categories.map((category) => (
            <button
              key={category.title}
              onClick={() => {
                setSelected(category.title);
                setMessage("");
                window.setTimeout(() => reportFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
              className={`min-h-36 rounded-3xl border p-4 text-left transition ${
                selected === category.title
                  ? "scale-[0.985] border-white/50 bg-slate-800 ring-2 ring-white/10"
                  : "border-slate-800 bg-slate-900 hover:bg-slate-800"
              }`}
            >
              <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${category.color} text-xl`}>{category.icon}</div>
              <p className="text-sm font-bold">{category.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{category.helper}</p>
            </button>
          ))}
        </section>

        {selected && (
          <section ref={reportFormRef} className="mt-6 scroll-mt-20 rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Paso 2 de 3</p>
                <h3 className="mt-1 text-xl font-black">{selectedCategory?.icon} {selected}</h3>
              </div>
              <button onClick={() => setSelected("")} className="text-sm text-slate-500">Cambiar</button>
            </div>

            <label className="mt-5 block text-sm font-semibold">Contanos qué estás observando</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
              placeholder="Ej.: vehículo detenido hace varios minutos frente a una vivienda…"
              className="mt-2 h-32 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm outline-none placeholder:text-slate-600 focus:border-red-500"
            />
            <div className="mt-1 text-right text-[11px] text-slate-600">{description.length}/1000</div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">📍 Ubicación</p>
                  <p className="mt-1 text-xs text-slate-500">Necesaria para ubicar correctamente la alerta.</p>
                </div>
                <button onClick={() => void getLocation()} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold">Obtener</button>
              </div>
              {locationMessage && <p className="mt-2 text-xs font-semibold text-slate-300">{locationMessage}</p>}
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold">Evidencia opcional</p>
              <p className="mt-1 text-xs text-slate-500">Adjuntá solo si podés hacerlo sin exponerte ni acercarte a la situación.</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="cursor-pointer rounded-2xl bg-slate-800 py-3 text-center text-sm font-semibold">
                📷 {photo ? "Foto ✓" : "Foto"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
              </label>
              <label className="cursor-pointer rounded-2xl bg-slate-800 py-3 text-center text-sm font-semibold">
                🎥 {video ? "Video ✓" : "Video"}
                <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => setVideo(e.target.files?.[0] || null)} />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (isRecording) {
                    stopRecording();
                  } else {
                    void startRecording();
                  }
                }}
                className={`rounded-2xl py-3 text-sm font-semibold ${isRecording ? "bg-red-600" : "bg-slate-800"}`}
              >
                {isRecording
                  ? "⏹️ Detener audio"
                  : audio
                    ? "🎤 Audio ✓"
                    : "🎙️ Grabar audio"}
              </button>
            <button
  onClick={() => {
    setEmergencyMenuOpen((value) => !value);

    window.setTimeout(() => {
      emergencyMenuRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  }}
  className="rounded-2xl bg-red-600 py-3 text-sm font-semibold"
> 
                ☎️ Emergencias
              </button>
            </div>

            {emergencyMenuOpen && (
             <div
  ref={emergencyMenuRef}
  className="fixed inset-x-4 bottom-4 z-[9999] mx-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-2xl border border-red-500/30 bg-slate-950 p-4 shadow-2xl"
> 
                <p className="mb-3 text-center font-bold">Si hay peligro inmediato, llamá al servicio correspondiente</p>
                <div className="grid gap-2">
                  <a href="tel:911" className="rounded-xl bg-red-600 p-3 text-center font-bold">🆘 Emergencias 911</a>
                  <a href="tel:101" className="rounded-xl bg-blue-600 p-3 text-center font-bold">🚓 Policía 101</a>
                  <a href="tel:107" className="rounded-xl bg-emerald-600 p-3 text-center font-bold">🚑 Emergencia médica 107</a>
                  <a href="tel:100" className="rounded-xl bg-orange-600 p-3 text-center font-bold">🚒 Bomberos 100</a>
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">
              ⚠️ No intervengas, no persigas y no te expongas para obtener una foto o video. Ante peligro inmediato, llamá al 911.
            </div>

            <button
              onClick={() => void sendReport()}
              disabled={sending}
              className="mt-4 w-full rounded-2xl bg-red-500 py-4 font-black transition hover:bg-red-600 disabled:opacity-50"
            >
              {sending ? "ENVIANDO ALERTA…" : "🚨 ENVIAR ALERTA"}
            </button>
          </section>
        )}

        {message && (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-center text-sm font-semibold">{message}</div>
        )}

        <section className="mt-7 rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">{notificationsEnabled ? "🔔" : "🔕"}</div>
            <div className="flex-1">
              <h3 className="font-black">Alertas cercanas</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {isAndroidApp
                  ? "Avisos de situaciones reportadas dentro de 5 km. En Android, las alertas importantes pueden llegar mediante notificaciones nativas aunque no tengas la app abierta."
                  : "Avisos de situaciones reportadas dentro de 5 km. Las alertas importantes pueden llegar aunque no tengas la app abierta. En iPhone/iPad, agregá la web a la pantalla de inicio para usar notificaciones push."}
              </p>
              <button
                onClick={() => void toggleNotifications()}
                disabled={notificationBusy}
                className={`mt-3 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${notificationsEnabled ? "bg-slate-800" : "bg-yellow-500 text-slate-950"}`}
              >
                {notificationBusy ? "Procesando…" : notificationsEnabled ? "Desactivar avisos" : "Activar alertas cercanas"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={() => (window.location.href = "/mapa")} className="rounded-2xl border border-slate-800 bg-slate-900 py-4 text-sm font-bold hover:bg-slate-800">🗺️ Ver mapa</button>
          <button onClick={() => (window.location.href = "/mis-reportes")} className="rounded-2xl border border-slate-800 bg-slate-900 py-4 text-sm font-bold hover:bg-slate-800">📄 Mis reportes</button>
        </section>

        <footer className="py-8 text-center text-xs text-slate-600">
          <p>ALERTA OTAMENDI · Comunidad conectada</p>
          <p className="mt-1 text-[9px] tracking-widest text-slate-700">
            RVS DESARROLLADOR
          </p>
        </footer>
      </div>
    </main>
  );
}
