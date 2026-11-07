/** Completes the local CMS setup (seed + sample content) once before the suite. */
export default async function globalSetup(): Promise<void> {
	const base = "http://localhost:4321";
	const response = await fetch(`${base}/_emdash/api/setup/dev-bypass`, {
		method: "POST",
		headers: { "X-EmDash-Request": "1", Origin: base },
	});
	if (!response.ok) throw new Error(`setup failed: ${response.status} ${await response.text()}`);
}
