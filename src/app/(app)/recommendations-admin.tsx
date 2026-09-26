import React from 'react';

import { StackScreen } from '@/components/navigation/StackScreen';
import { AdminOnlyNotice } from '@/features/admin/components/AdminState';
import { RecommendationsEnginePanel } from '@/features/admin/panels/RecommendationsEnginePanel';
import { useAuthStore } from '@/store/authStore';

/** Recommendations engine admin (web: /recommendations/admin). Every route it calls is admin-only. */
export default function RecommendationsAdminScreen() {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  if (!isAdmin) {
    return (
      <StackScreen title="Recommendations engine">
        <AdminOnlyNotice />
      </StackScreen>
    );
  }
  return <RecommendationsEnginePanel />;
}
