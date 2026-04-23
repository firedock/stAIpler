import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Build a URL anchored at the public origin (from ALB's forwarded headers),
 * not the container's internal hostname. `request.nextUrl` inside EB/Docker
 * reports the container hostname (e.g. 12372f0779ec:8080), which breaks
 * any redirect built from it.
 */
function publicUrl(request: NextRequest, pathname: string, search = ''): URL {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  return new URL(`${proto}://${host}${pathname}${search}`);
}

export async function updateSession(request: NextRequest) {
  // HTTPS redirect in production
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http' && process.env.NODE_ENV === 'production') {
    return NextResponse.redirect(
      publicUrl(request, request.nextUrl.pathname, request.nextUrl.search),
      301,
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protect /dashboard routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(publicUrl(request, '/login'));
  }

  // Redirect logged-in users from login to dashboard
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(publicUrl(request, '/dashboard'));
  }

  return supabaseResponse;
}
