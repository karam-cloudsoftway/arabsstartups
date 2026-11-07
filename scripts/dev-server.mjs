#!/usr/bin/env node
/**
 * Start/stop a detached local dev server (loopback only) for agents and tests.
 *   node scripts/dev-server.mjs start   # returns immediately; logs to .dev-server.log
 *   node scripts/dev-server.mjs status
 *   node scripts/dev-server.mjs stop
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const pidFile = new URL(".dev-server.pid", root);
const logFile = new URL(".dev-server.log", root);
const URL_TO_CHECK = "http://localhost:4321/healthz";

function running() {
	if (!existsSync(pidFile)) return null;
	const pid = Number(readFileSync(pidFile, "utf8"));
	try {
		process.kill(pid, 0);
		return pid;
	} catch {
		rmSync(pidFile, { force: true });
		return null;
	}
}

async function waitReady(timeoutMs = 90_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(URL_TO_CHECK, { signal: AbortSignal.timeout(3000) });
			if (res.status < 500) return true;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}

const command = process.argv[2] ?? "status";
// --preview serves the PRODUCTION build (`astro preview`, workerd) instead of `astro dev`.
const mode = process.argv.includes("--preview") ? "preview" : "dev";
if (command === "start") {
	if (running()) {
		console.log(`already running (pid ${running()})`);
	} else {
		const out = openSync(logFile, "w");
		const child = spawn(process.execPath, ["node_modules/astro/bin/astro.mjs", mode], {
			cwd: root,
			detached: true,
			stdio: ["ignore", out, out],
			env: { ...process.env, BROWSER: "none" },
		});
		child.unref();
		writeFileSync(pidFile, String(child.pid));
		console.log(`started (pid ${child.pid}), waiting for ${URL_TO_CHECK} …`);
		console.log((await waitReady()) ? "ready" : "not ready yet — see .dev-server.log");
	}
} else if (command === "stop") {
	const pid = running();
	if (pid) {
		try {
			process.kill(-pid, "SIGTERM");
		} catch {
			process.kill(pid, "SIGTERM");
		}
		rmSync(pidFile, { force: true });
		console.log(`stopped (pid ${pid})`);
	} else console.log("not running");
} else {
	const pid = running();
	console.log(pid ? `running (pid ${pid})` : "not running");
}
