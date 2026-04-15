export function shouldRenderToolkitLogo(logoUrl: string | undefined, isLogoBroken: boolean) {
  return Boolean(logoUrl) && !isLogoBroken;
}
