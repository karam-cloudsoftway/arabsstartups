/**
 * Allow-listed media embeds. Editors paste a normal YouTube / Spotify /
 * LinkedIn / Vimeo / Apple Podcasts / SoundCloud link; we build the player
 * URL ourselves. Anything else is shown as a plain link, never an iframe.
 * We never host video or audio files ourselves.
 */
export interface Embed {
	provider: "youtube" | "spotify" | "linkedin" | "vimeo" | "apple" | "soundcloud";
	src: string;
	title: string;
	aspect: "video" | "audio";
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const DIGITS = /^\d{6,25}$/;

function safeUrl(raw: string): URL | null {
	try {
		const url = new URL(raw.trim());
		return url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

export function toEmbed(raw: string | null | undefined, title = ""): Embed | null {
	if (!raw) return null;
	const url = safeUrl(raw);
	if (!url) return null;
	const host = url.hostname.replace(/^www\.|^m\./, "");

	if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
		let id: string | null = null;
		if (host === "youtu.be") id = url.pathname.slice(1);
		else if (url.pathname === "/watch") id = url.searchParams.get("v");
		else {
			const match = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
			id = match?.[1] ?? null;
		}
		if (id && YT_ID.test(id)) {
			return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, title, aspect: "video" };
		}
		return null;
	}

	if (host === "open.spotify.com") {
		const match = /^\/(?:embed\/)?(episode|show)\/([^/?#]+)/.exec(url.pathname);
		if (match && match[2] && SPOTIFY_ID.test(match[2])) {
			return { provider: "spotify", src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, title, aspect: "audio" };
		}
		return null;
	}

	if (host === "linkedin.com") {
		const match = /(?:urn:li:|urn%3Ali%3A)(activity|share|ugcPost)(?::|%3A)(\d+)/i.exec(url.href) ??
			/activity-(\d+)/.exec(url.pathname);
		const kind = match && match.length === 3 ? match[1] : "activity";
		const id = match ? match[match.length - 1] : null;
		if (id && DIGITS.test(id)) {
			return { provider: "linkedin", src: `https://www.linkedin.com/embed/feed/update/urn:li:${kind}:${id}`, title, aspect: "video" };
		}
		return null;
	}

	if (host === "vimeo.com" || host === "player.vimeo.com") {
		const match = /\/(?:video\/)?(\d{6,12})(?:$|[/?#])/.exec(url.pathname);
		if (match?.[1]) {
			return { provider: "vimeo", src: `https://player.vimeo.com/video/${match[1]}`, title, aspect: "video" };
		}
		return null;
	}

	if (host === "podcasts.apple.com" || host === "embed.podcasts.apple.com") {
		if (/^\/[a-z]{2}\/podcast\//.test(url.pathname)) {
			const query = url.searchParams.get("i") ? `?i=${encodeURIComponent(url.searchParams.get("i") ?? "")}` : "";
			return { provider: "apple", src: `https://embed.podcasts.apple.com${url.pathname}${query}`, title, aspect: "audio" };
		}
		return null;
	}

	if (host === "soundcloud.com") {
		const target = encodeURIComponent(`https://soundcloud.com${url.pathname}`);
		return { provider: "soundcloud", src: `https://w.soundcloud.com/player/?url=${target}`, title, aspect: "audio" };
	}

	return null;
}
