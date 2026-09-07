"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase"; 
const categories = [
  { icon: "🚨", title: "Delito / Robo", color: "bg-red-500" },
  { icon: "👤", title: "Persona sospechosa", color: "bg-orange-500" },
  { icon: "🚗", title: "Vehículo sospechoso", color: "bg-yellow-500" },
  { icon: "⚠️", title: "Accidente", color: "bg-blue-500" },
  { icon: "🔥", title: "Incendio", color: "bg-purple-500" },
  { icon: "🆘", title: "Emergencia", color: "bg-emerald-500" },
];

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
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export default function Home() {
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
const [emergencyMenuOpen, setEmergencyMenuOpen] = useState(false);


  const [isRecording, setIsRecording] = useState(false);
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const audioChunksRef = useRef<Blob[]>([]);
  const reportFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
  const saved = localStorage.getItem("notificationsEnabled");
  setNotificationsEnabled(saved === "true");
}, []);

useEffect(() => {
  if (notificationsEnabled && (latitude === null || longitude === null)) {
    getLocation();
  }
}, [notificationsEnabled]);
  useEffect(() => {
  if (
    !notificationsEnabled ||
    latitude === null ||
    longitude === null
  ) {
    return;
  }

  const channel = supabase
    .channel("alertas-cercanas")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "Report",
      },
      (payload) => {
        const reporte = payload.new as {
          category?: string;
          description?: string;
          latitude?: number | null;
          longitude?: number | null;
        };

        if (
          reporte.latitude == null ||
          reporte.longitude == null
        ) {
          return;
        }

        const distancia = calcularDistanciaKm(
          latitude,
          longitude,
          reporte.latitude,
          reporte.longitude
        );

        if (distancia <= 25) {
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification("🚨 Alerta cercana", {
              body: `${reporte.category ?? "Nueva alerta"} a ${distancia.toFixed(1)} km de tu ubicación`,
            });
          }
const sonido = new Audio("/alerta_beep.wav");
sonido.volume = 1;
sonido.play().catch((error) => {
  console.log("El navegador bloqueó el sonido:", error);
});
          if ("vibrate" in navigator) {
            navigator.vibrate([300, 150, 300]);
          }
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [notificationsEnabled, latitude, longitude]);
async function toggleNotifications() {
  if (notificationsEnabled) {
    getLocation();  
    
    localStorage.setItem("notificationsEnabled", "false");
    setNotificationsEnabled(false);
    return;
  }

  if (!("Notification" in window)) {
    alert("Este dispositivo no permite notificaciones.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    alert("Necesitamos permiso para enviarte alertas cercanas.");
    return;
  }

  localStorage.setItem("notificationsEnabled", "true");
  setNotificationsEnabled(true);
}
function getLocation() {
  if (!navigator.geolocation) {
    setLocationMessage("❌ Este dispositivo no permite geolocalización.");
    return;
  }

  setLocationMessage("📍 Obteniendo ubicación...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
      setLocationMessage("✅ Ubicación obtenida correctamente.");
    },
    () => {
      setLocationMessage("❌ No se pudo obtener la ubicación.");
    }
  );
}
 async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || "audio/webm";

      const blob = new Blob(audioChunksRef.current, {
        type: mimeType,
      });

      const file = new File(
        [blob],
        `audio-${Date.now()}.webm`,
        { type: mimeType }
      );

      setAudio(file);
      setIsRecording(false);

      recorder.stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    setIsRecording(true);
  } catch (error) {
    console.error("Error al acceder al micrófono:", error);
    setMessage("❌ No se pudo acceder al micrófono.");
    setIsRecording(false);
  }
}

function stopRecording() {
  const recorder = mediaRecorderRef.current;

  if (recorder && recorder.state === "recording") {
    recorder.stop();
  }
}
async function sendReport() {
  if (!selected || !description.trim()) {
    setMessage("⚠️ Escribí una descripción antes de enviar.");
    return;
  }
let reportLatitude = latitude;
let reportLongitude = longitude;

if (reportLatitude === null || reportLongitude === null) {
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });

    reportLatitude = position.coords.latitude;
    reportLongitude = position.coords.longitude;

    setLatitude(reportLatitude);
    setLongitude(reportLongitude);
  } catch (error) {
    console.error("No se pudo obtener la ubicación:", error);
    setMessage("❌ Necesitamos tu ubicación para enviar la alerta.");
    return;
  }
}
  setSending(true);
  setMessage("");

  try {
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;
    let audioUrl: string | null = null;

    // SUBIR FOTO
    if (photo) {
      const fileExt = photo.name.split(".").pop();
      const fileName = `fotos/${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("alertas")
        .upload(fileName, photo);

      if (uploadError) {
        console.error("Error subiendo foto:", uploadError);
        setMessage("❌ No se pudo subir la foto.");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("alertas")
        .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    // SUBIR VIDEO
    if (video) {
      const fileExt = video.name.split(".").pop();
      const fileName = `videos/${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("alertas")
        .upload(fileName, video);

      if (uploadError) {
        console.error("Error subiendo video:", uploadError);
        setMessage("❌ No se pudo subir el video.");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("alertas")
        .getPublicUrl(fileName);

      videoUrl = publicUrlData.publicUrl;
    }

    // SUBIR AUDIO
    if (audio) {
      const fileExt = audio.name.split(".").pop();
      const fileName = `audios/${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("alertas")
        .upload(fileName, audio);

      if (uploadError) {
        console.error("Error subiendo audio:", uploadError);
        setMessage("❌ No se pudo subir el audio.");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("alertas")
        .getPublicUrl(fileName);

      audioUrl = publicUrlData.publicUrl;
    }

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: selected,
        description,
        latitude: reportLatitude,
        longitude: reportLongitude,
        imageUrl,
        videoUrl,
        audioUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage("❌ No se pudo enviar la alerta.");
      return;
    }
if (data.report?.id) {
  const savedReports = JSON.parse(
    localStorage.getItem("mis_reportes") || "[]"
  );

  if (!savedReports.includes(data.report.id)) {
    savedReports.push(data.report.id);
    localStorage.setItem("mis_reportes", JSON.stringify(savedReports));
  }
} 
    setMessage(
      `✅ Alerta enviada correctamente. Número de reporte: #${data.report?.id ?? ""}`
    );

    setDescription("");
    setSelected("");
    setPhoto(null);
    setVideo(null);
    setAudio(null);
    setLatitude(null);
    setLongitude(null);
    setLocationMessage("");
  } catch (error) {
    console.error("Error enviando alerta:", error);
    setMessage("❌ Error de conexión con el sistema.");
  } finally {
    setSending(false);
  }
}
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-5 pb-10">

        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-2xl">
              🚨
            </div>

            <div>
              <h1 className="text-xl font-bold">ALERTA</h1>
              <p className="text-sm font-semibold text-red-400">
                OTAMENDI
              </p>
            </div>
          </div>

        <button
  onClick={toggleNotifications}
  className={`flex h-11 w-11 items-center justify-center rounded-full ${
    notificationsEnabled ? "bg-yellow-500" : "bg-slate-800"
  }`}
>
  {notificationsEnabled ? "🔔" : "🔕"}
</button>
        </header>

        <section className="mb-7 mt-4">
          <p className="text-slate-400">Bienvenido</p>

          <h2 className="mt-1 text-3xl font-bold">
            ¿Qué está pasando?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Informá rápidamente una situación para ayudar a mantener
            comunicada a nuestra comunidad  
          </p>
        </section>

        <section>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.title}
              onClick={() => {
  setSelected(category.title);
  setMessage("");

  setTimeout(() => {
    reportFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 100);
}}
      className={`rounded-3xl border p-5 text-left transition-all ${
            selected === category.title
             ? "scale-[0.98] border-white bg-slate-700"
                 : "border-slate-800 bg-slate-900 hover:bg-slate-800"
                }`}
              > 
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${category.color} text-2xl`}
                >
                  {category.icon}
                </div>

                <p className="text-sm font-semibold">
                  {category.title}
                </p>
              </button>
            ))}
          </div>
        </section>

        {selected && (
       <section
            ref={reportFormRef}
            className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5"
               >
            <p className="text-sm text-slate-400">
              Categoría seleccionada
            </p>

            <h3 className="mt-1 text-xl font-bold">
              {selected}
            </h3>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contanos qué estás observando..."
              className="mt-4 h-32 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm outline-none placeholder:text-slate-600 focus:border-red-500"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">

  <label className="cursor-pointer rounded-2xl bg-slate-800 py-3 text-center text-sm font-semibold">
    📷 Foto

    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0] || null;
        setPhoto(file);
      }}
    />
  </label>
  <label className="cursor-pointer rounded-2xl bg-slate-800 py-3 text-center text-sm font-semibold">
  🎥 Video

  <input
    type="file"
    accept="video/*"
    capture="environment"
    className="hidden"
    onChange={(e) => {
      const file = e.target.files?.[0] || null;
      setVideo(file);
    }}
  />
</label>
<button
  type="button"
  onPointerDown={startRecording}
  onPointerUp={stopRecording}
  onPointerCancel={stopRecording}
  onPointerLeave={() => {
    if (isRecording) stopRecording();
  }}
  className={`rounded-2xl py-3 text-center text-sm font-semibold ${
    isRecording
      ? "bg-red-600 text-white"
      : "bg-slate-800 text-white"
  }`}
>
  {isRecording
    ? "🔴 Grabando... soltá para terminar"
    : audio
    ? "🎤 Audio grabado ✓"
    : "🎤 Mantené apretado para grabar"}
</button>
<button
  onClick={() => setEmergencyMenuOpen(!emergencyMenuOpen)}
  className="rounded-2xl bg-red-600 py-3 text-sm font-semibold text-white"
>
  ☎️ Emergencias
</button> 
             {emergencyMenuOpen && (
  <div className="col-span-2 mt-2 rounded-2xl border border-red-500/30 bg-slate-900 p-4">
    <h3 className="mb-3 text-center text-lg font-bold text-white">
      🚨 Números de emergencia
    </h3>

    <div className="grid gap-2">
      <a
        href="tel:911"
        className="rounded-xl bg-red-600 p-3 text-center font-semibold text-white"
      >
        🆘 Emergencias 911 — LLAMAR
      </a>

      <a
        href="tel:101"
        className="rounded-xl bg-blue-600 p-3 text-center font-semibold text-white"
      >
        🚓 Policía — LLAMAR
      </a>

      <a
        href="tel:107"
        className="rounded-xl bg-emerald-600 p-3 text-center font-semibold text-white"
      >
        🚑 Emergencia médica — LLAMAR
      </a>

      <a
        href="tel:100"
        className="rounded-xl bg-orange-600 p-3 text-center font-semibold text-white"
      >
        🚒 Bomberos — LLAMAR
      </a>

      <button
        type="button"
        onClick={() => setEmergencyMenuOpen(false)}
        className="mt-1 rounded-xl bg-slate-700 p-3 font-semibold text-white"
      >
        ✕ Cerrar
      </button>
    </div>
  </div>
)} 
</div>
{video && (
  <p className="mt-2 text-center text-sm font-semibold text-green-400">
    ✅ Video seleccionado: {video.name}
  </p>
)}
{audio && (
  <p className="mt-2 text-center text-sm font-semibold text-green-400">
    ✅ Audio seleccionado: {audio.name}
  </p>
)}
{photo && (
  <p className="mt-2 text-center text-sm font-semibold text-green-400">
    ✅ Foto seleccionada: {photo.name}
  </p>
)}
            {locationMessage && (
  <p className="mt-3 text-center text-sm font-semibold text-slate-300">
    {locationMessage}
  </p>
)}
            <button
              onClick={sendReport}
              disabled={sending}
              className="mt-4 w-full rounded-2xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
            >
              {sending ? "ENVIANDO..." : "🚨 ENVIAR ALERTA"}
            </button>
          </section>
        )}

        {message && (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-center text-sm font-semibold">
            {message}
          </div>
        )}

        <section className="mt-7 grid grid-cols-2 gap-3">
       <button
  onClick={() => {
    window.location.href = "/mapa";
  }}
  className="rounded-2xl border border-slate-800 bg-slate-900 py-4 text-sm font-semibold"
>
  🗺️ Ver mapa
       </button>

<button
    onClick={() => {
    window.location.href = "/mis-reportes";
  }}
    className="rounded-2xl border border-slate-800 bg-slate-900 py-4 text-sm font-semibold"
>
  📄 Mis reportes
</button>
        </section>

        <section className="mt-7 rounded-3xl bg-slate-900 p-5">
          <div className="flex gap-3">
            <div className="text-xl">ℹ️</div>

            <div>
              <h3 className="font-semibold">
                Usá la aplicación responsablemente
              </h3>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                Informá solamente situaciones que hayas observado.
                Los reportes serán revisados antes de tomar acciones.
              </p>
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-slate-600">
          ALERTA OTAMENDI · Comunidad conectada
        </footer>
      </div>
    </main>
  );
}
