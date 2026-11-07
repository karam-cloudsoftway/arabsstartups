/**
 * Progressive enhancement for public forms (comments, contact).
 * Bundled by Astro into an external file, so the CSP allows no inline script.
 * All real validation happens on the server; this only improves feedback.
 */
interface ApiError {
	error?: string;
	fields?: Record<string, string>;
}

declare global {
	interface Window {
		turnstile?: { reset: (widget?: string | HTMLElement) => void };
	}
}

function messages(form: HTMLFormElement): Record<string, string> {
	try {
		return JSON.parse(form.dataset.messages ?? "{}") as Record<string, string>;
	} catch {
		return {};
	}
}

function setStatus(form: HTMLFormElement, kind: "success" | "error" | "", text: string): void {
	const status = form.querySelector<HTMLElement>("[data-form-status]");
	if (!status) return;
	status.textContent = text;
	status.dataset.kind = kind;
	status.hidden = !text;
}

function clearFieldErrors(form: HTMLFormElement): void {
	for (const el of form.querySelectorAll<HTMLElement>("[aria-invalid='true']")) {
		el.removeAttribute("aria-invalid");
	}
	for (const el of form.querySelectorAll<HTMLElement>("[data-field-error]")) {
		el.textContent = "";
		el.hidden = true;
	}
}

function showFieldErrors(form: HTMLFormElement, fields: Record<string, string>, dict: Record<string, string>): void {
	let first: HTMLElement | null = null;
	for (const [name, code] of Object.entries(fields)) {
		const input = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
		const slot = form.querySelector<HTMLElement>(`[data-field-error="${CSS.escape(name)}"]`);
		if (input) {
			input.setAttribute("aria-invalid", "true");
			first ??= input;
		}
		if (slot) {
			slot.textContent = dict[code] ?? dict.invalid ?? code;
			slot.hidden = false;
		}
	}
	first?.focus();
}

function errorText(dict: Record<string, string>, status: number, body: ApiError): string {
	switch (body.error) {
		case "validation":
			return dict.validation ?? "";
		case "turnstile":
			return dict.turnstile ?? "";
		case "rate_limited":
			return dict.rateLimited ?? "";
		case "duplicate":
			return dict.duplicate ?? "";
		case "comments_closed":
		case "comments_disabled":
			return dict.closed ?? "";
		case "content_not_found":
		case "parent_not_found":
			return dict.notFound ?? "";
		default:
			return status === 429 ? (dict.rateLimited ?? "") : (dict.generic ?? "");
	}
}

function setupReplyButtons(form: HTMLFormElement): void {
	const parentInput = form.querySelector<HTMLInputElement>("input[name='parentId']");
	const banner = form.querySelector<HTMLElement>("[data-reply-banner]");
	const bannerName = form.querySelector<HTMLElement>("[data-reply-name]");
	const cancel = form.querySelector<HTMLButtonElement>("[data-reply-cancel]");
	if (!parentInput || !banner) return;
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-reply-to]")) {
		button.addEventListener("click", () => {
			parentInput.value = button.dataset.replyTo ?? "";
			if (bannerName) bannerName.textContent = button.dataset.replyAuthor ?? "";
			banner.hidden = false;
			form.scrollIntoView({ behavior: "smooth", block: "start" });
			form.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
		});
	}
	cancel?.addEventListener("click", () => {
		parentInput.value = "";
		banner.hidden = true;
	});
}

function setup(form: HTMLFormElement): void {
	const dict = messages(form);
	const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
	const idleLabel = submit?.textContent ?? "";
	if (form.dataset.asForm === "comment") setupReplyButtons(form);

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (form.dataset.busy === "1") return;
		form.dataset.busy = "1";
		clearFieldErrors(form);
		setStatus(form, "", "");
		if (submit) {
			submit.setAttribute("aria-busy", "true");
			submit.textContent = form.dataset.sendingLabel ?? idleLabel;
		}

		const data = new FormData(form);
		const payload: Record<string, string> = {};
		for (const [key, value] of data.entries()) {
			if (typeof value === "string") payload[key] = value;
		}
		payload.turnstileToken = payload["cf-turnstile-response"] ?? "";
		delete payload["cf-turnstile-response"];

		try {
			const response = await fetch(form.action, {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify(payload),
				credentials: "same-origin",
			});
			const body = (await response.json().catch(() => ({}))) as ApiError;
			if (response.ok) {
				setStatus(form, "success", form.dataset.successMessage ?? "");
				form.reset();
				const parent = form.querySelector<HTMLInputElement>("input[name='parentId']");
				if (parent) parent.value = "";
				const banner = form.querySelector<HTMLElement>("[data-reply-banner]");
				if (banner) banner.hidden = true;
			} else {
				if (body.fields) showFieldErrors(form, body.fields, dict);
				setStatus(form, "error", errorText(dict, response.status, body));
			}
		} catch {
			setStatus(form, "error", dict.generic ?? "");
		} finally {
			window.turnstile?.reset(form.querySelector<HTMLElement>(".cf-turnstile") ?? undefined);
			form.dataset.busy = "";
			if (submit) {
				submit.removeAttribute("aria-busy");
				submit.textContent = idleLabel;
			}
		}
	});
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-as-form]")) setup(form);

// "Copy link" share button
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-link]")) {
	button.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(button.dataset.copyLink ?? location.href);
			button.dataset.copied = "1";
			const done = button.dataset.copiedLabel;
			if (done) button.textContent = done;
		} catch {
			/* clipboard not available */
		}
	});
}

export {};
