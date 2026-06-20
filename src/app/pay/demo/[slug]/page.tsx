import { notFound } from "next/navigation";

import { resolveDemoTableToken } from "@/lib/demo-table-catalog";

import DemoSlugClient from "./client";

interface DemoSlugPageProps {
  params: Promise<{ slug: string }>;
}

export default async function DemoSlugPage({ params }: DemoSlugPageProps) {
  const { slug } = await params;

  // `/pay/demo/default` is a friendly alias for the canonical `/pay/demo`.
  const token = slug === "default" ? "demo" : `demo-${slug}`;
  const def = resolveDemoTableToken(token);
  if (!def) {
    notFound();
  }

  return <DemoSlugClient token={token} />;
}
