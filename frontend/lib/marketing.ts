// The public marketing page lives at /welcome; signed-out visitors get it at / too (a rewrite, so the address stays /).
export const MARKETING_PATH = "/welcome";

export const marketingRewrite = (pathname: string, signedIn: boolean) =>
  !signedIn && pathname === "/" ? MARKETING_PATH : null;
