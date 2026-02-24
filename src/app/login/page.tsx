"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #0a0f1c 0%, #1a1f3c 50%, #0a0f1c 100%)",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        padding: 40,
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: 16,
        border: "1px solid rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(20px)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 32,
            fontWeight: 800,
            background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}>
            Balboa
          </div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 8 }}>
            Sales intelligence for your team
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="you@company.com"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="Your password"
            />
          </div>

          {error && (
            <div style={{
              padding: "10px 14px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 10,
              color: "#fca5a5",
              fontSize: 13,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading ? "rgba(96, 165, 250, 0.3)" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 20 }}>
          Don&apos;t have an account?{" "}
          <a href="/signup" style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 500 }}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
