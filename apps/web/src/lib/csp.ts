/** Content-Security-Policy with a per-request nonce (Next.js applies it to its own inline scripts). */
export function buildCsp(nonce: string, supabaseUrl: string, isDev: boolean): string {
  let sb = "";
  try {
    const u = new URL(supabaseUrl);
    sb = `${u.origin} ${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
  } catch {
    sb = "";
  }
  const stripe = "https://checkout.stripe.com";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React style attributes are used for progress bars and timeline positions.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${sb.split(" ")[0] ?? ""}`.trim(),
    `media-src 'self' blob: ${sb.split(" ")[0] ?? ""}`.trim(),
    `connect-src 'self' ${sb}`.trim(),
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${stripe}`,
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
