/// <reference types="astro/client" />

import type { AccessIdentity } from "./lib/security/access-jwt";

declare global {
	namespace App {
		interface Locals {
			/** Verified Cloudflare Access identity (production, protected paths only). */
			accessIdentity?: AccessIdentity;
		}
	}
}

export {};
