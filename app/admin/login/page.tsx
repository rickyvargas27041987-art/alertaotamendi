"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        router.push("/admin");
        router.refresh();
      } else {
        setError("Contraseña incorrecta");
      }
    } catch {
      setError("No se pudo iniciar sesión. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #07111f 0%, #0b1d35 50%, #08111e 100%)",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#101d2d",
          border: "1px solid #263b52",
          borderRadius: "20px",
          padding: "35px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "18px",
            background: "#dc2626",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "32px",
          }}
        >
          🚨
        </div>

        <h1
          style={{
            color: "white",
            textAlign: "center",
            marginBottom: "8px",
          }}
        >
          ALERTA OTAMENDI
        </h1>

        <p
          style={{
            color: "#94a3b8",
            textAlign: "center",
            marginBottom: "30px",
          }}
        >
          Acceso al panel de administración
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              color: "#cbd5e1",
              marginBottom: "8px",
            }}
          >
            Contraseña
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ingresá tu contraseña"
            required
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid #334155",
              background: "#0b1523",
              color: "white",
              fontSize: "16px",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <p
              style={{
                color: "#f87171",
                marginTop: "12px",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: "20px",
              padding: "14px",
              border: "none",
              borderRadius: "10px",
              background: "#dc2626",
              color: "white",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p
          style={{
            color: "#64748b",
            textAlign: "center",
            fontSize: "12px",
            marginTop: "25px",
          }}
        >
          Panel privado • Alerta Otamendi
        </p>
      </div>
    </main>
  );
}
