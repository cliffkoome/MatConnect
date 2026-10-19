import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center", padding: "1rem" }}>
      <div>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Page not found</h1>
        <p style={{ marginBottom: "1.5rem", color: "#6b7280" }}>That page doesn&apos;t exist (or has moved).</p>
        <Link href="/" style={{ color: "#137fec", fontWeight: 600 }}>
          Back to MatConnect
        </Link>
      </div>
    </main>
  );
}
