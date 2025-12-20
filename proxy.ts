import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /file/* to /?file=*
  if (pathname.startsWith("/file/")) {
    const filePath = pathname.replace(/^\/file\//, "");
    const decodedFilePath = decodeURIComponent(filePath);
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("file", decodedFilePath);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/file/:path*",
};
