import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardNav } from '@/components/dashboard-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <DashboardNav email={user.email ?? ''} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
