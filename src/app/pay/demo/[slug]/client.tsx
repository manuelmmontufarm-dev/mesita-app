"use client";

import { GuestPayPage } from "@/components/guest/GuestPayPage";

import "../../customer.css";

export default function DemoSlugClient({ token }: { token: string }) {
  return <GuestPayPage token={token} />;
}
