"use client";

import { useEffect, useState } from "react";

export default function Footer({ version }: { version: string }) {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/views", { method: "POST" })
      .then((r) => r.json())
      .then((d: { count: number }) => setViews(d.count))
      .catch(() => {});
  }, []);

  return (
    <footer className="fixed bottom-0 left-0 right-0 text-center text-xs text-gray-500 py-2 bg-black/60 backdrop-blur-sm">
      &copy; <a href="mailto:tacombel@gmail.com" className="hover:text-gray-300">tacombel@gmail.com</a>
      {" · "}{version}
      {views !== null && <span className="ml-3 text-gray-600">{views.toLocaleString("es-ES")} visitas</span>}
    </footer>
  );
}
