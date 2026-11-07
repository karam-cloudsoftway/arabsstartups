import type { APIRoute } from "astro";

export const prerender = false;
export const GET: APIRoute = ({ redirect }) => redirect("/episodes?type=webinar", 301);
