"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      // Auto-redirect after 2 seconds
      setTimeout(() => router.push("/login"), 2000);
    }
  };

  if (success) {
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
          textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Account created!
          </h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            Check your email to confirm, then sign in.
          </p>
          <a href="/login" style={{
            display: "inline-block",
            marginTop: 20,
            color: "#60a5fa",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: 14,
          }}>
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

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
            Create your team account
          </p>
        </div>

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 6, fontWeight: 500 }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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
              placeholder="Santiago Giraldo"
            />
          </div>

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
              minLength={6}
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
              placeholder="Min 6 characters"
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
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 20 }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 500 }}>
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
