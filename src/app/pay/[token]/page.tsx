'use client';

import { use } from 'react';

import { GuestPayPage } from '@/components/guest/GuestPayPage';

import '../customer.css';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function GuestBillPage({ params }: PageProps) {
  const { token } = use(params);
  return <GuestPayPage token={token} />;
}
