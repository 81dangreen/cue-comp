// Product name shown in the UI. Set NEXT_PUBLIC_APP_NAME to rebrand.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Cue Comp";

// The site's own domain. Visits to the hosting provider's address (*.onrender.com) are sent here, so
// links, invites and tablet QR codes never point at the provider's address. Set SITE_HOST to change it.
export const SITE_HOST = process.env.SITE_HOST || "cuecomp.app";
