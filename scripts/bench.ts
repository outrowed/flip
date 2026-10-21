#!/usr/bin/env node
import autocannon, { type Options, type Result } from "autocannon";
import { parseArgs } from "node:util";

export type ScenarioName = "health" | "svg-cached" | "webp-cached" | "webp-cold" | "same-key-burst" | "still-frame";

export interface BenchOptions {
    baseUrl: string;
    scenario: ScenarioName;
    connections: number;
    amount?: number;
    duration?: number;
    confirmed: boolean;
}

export interface Scenario {
    name: ScenarioName;
    description: string;
    requests: NonNullable<Options["requests"]>;
    requiresConfirmation: boolean;
    warmupPath?: string;
}

const SCENARIOS: Scenario[] = [
    {
        name: "health",
        description: "Liveness endpoint; low-cost baseline.",
        requests: [{ path: "/health" }],
        requiresConfirmation: false,
    },
    {
        name: "svg-cached",
        description: "Repeated cached SVG generation.",
        requests: [{ path: "/api/svg?text=bench-cached-svg&format=svg" }],
        requiresConfirmation: false,
    },
    {
        name: "webp-cached",
        description: "Repeated cached animated WebP retrieval; primes one small render first.",
        requests: [{ path: "/api/svg?text=bench-cached-webp&format=webp" }],
        warmupPath: "/api/svg?text=bench-cached-webp&format=webp&sync=true",
        requiresConfirmation: true,
    },
    {
        name: "webp-cold",
        description: "Distinct animated WebP cache misses; may enqueue renders and receive placeholders/503 backpressure.",
        requests: Array.from({ length: 100 }, (_, index) => ({
            path: `/api/svg?format=webp&text=bench-cold-${index}`,
        })),
        requiresConfirmation: true,
    },
    {
        name: "same-key-burst",
        description: "Concurrent cold requests for one identical WebP key; exercises single-flight deduplication.",
        requests: [{ path: "/api/svg?format=webp&text=bench-dedupe-burst" }],
        requiresConfirmation: true,
    },
    {
        name: "still-frame",
        description: "Still-frame WebP requests; bypasses the animated render queue.",
        requests: [{ path: "/api/frame?text=bench-still&frame=0&format=webp" }],
        requiresConfirmation: true,
    },
];

const MAX_CONNECTIONS = 100;
const MAX_AMOUNT = 1000;
const MAX_DURATION_SECONDS = 120;

export function parseBenchArgs(argv: string[]): BenchOptions & { help: boolean } {
    const args = argv[0] === "--" ? argv.slice(1) : argv;
    const { values } = parseArgs({
        args,
        options: {
            base: {
                type: "string",
                default: "http://127.0.0.1:3029",
            },
            scenario: {
                type: "string",
                default: "health",
            },
            connections: {
                type: "string",
                default: "10",
            },
            amount: { type: "string" },
            duration: { type: "string" },
            confirm: {
                type: "boolean",
                default: false,
            },
            help: {
                type: "boolean",
                default: false,
            },
        },
        strict: true,
        allowPositionals: false,
    });

    const baseUrl = new URL(String(values.base));

    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
        throw new TypeError("Base URL must use HTTP or HTTPS.");
    }

    if (baseUrl.username || baseUrl.password) {
        throw new TypeError("Credentials in the base URL are not allowed.");
    }

    const scenario = String(values.scenario) as ScenarioName;

    if (!SCENARIOS.some(item => item.name === scenario)) {
        throw new TypeError(`Unknown scenario '${scenario}'. Available: ${SCENARIOS.map(item => item.name).join(", ")}`);
    }

    const connections = Number(values.connections);
    let amount = values.amount === undefined ? undefined : Number(values.amount);
    const duration = values.duration === undefined ? undefined : Number(values.duration);

    if (amount === undefined && duration === undefined) {
        amount = 100;
    }

    if (!Number.isInteger(connections) || connections < 1 || connections > MAX_CONNECTIONS) {
        throw new RangeError(`Connections must be from 1 to ${MAX_CONNECTIONS}.`);
    }

    if (amount !== undefined && duration !== undefined) {
        throw new TypeError("Specify exactly one of --amount or --duration.");
    }

    if (amount !== undefined && (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT)) {
        throw new RangeError(`Amount must be from 1 to ${MAX_AMOUNT}.`);
    }

    if (duration !== undefined && (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_SECONDS)) {
        throw new RangeError(`Duration must be from 1 to ${MAX_DURATION_SECONDS} seconds.`);
    }

    return {
        baseUrl: baseUrl.origin,
        scenario,
        connections,
        ...(amount === undefined ? {} : { amount }),
        ...(duration === undefined ? {} : { duration }),
        confirmed: Boolean(values.confirm),
        help: Boolean(values.help),
    };
}

export function getScenario(name: ScenarioName): Scenario {
    const scenario = SCENARIOS.find(item => item.name === name);

    if (!scenario) {
        throw new Error(`Unknown scenario: ${name}`);
    }

    return scenario;
}

export function isLoopbackTarget(baseUrl: string): boolean {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function runAutocannon(options: Options): Promise<Result> {
    return new Promise((resolve, reject) => {
        autocannon(options, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

export async function runBench(options: BenchOptions): Promise<Result> {
    const scenario = getScenario(options.scenario);
    const targetIsLocal = isLoopbackTarget(options.baseUrl);

    if (!targetIsLocal && !options.confirmed) {
        throw new Error(`Refusing remote target ${options.baseUrl} without --confirm.`);
    }

    if (scenario.requiresConfirmation && !options.confirmed) {
        throw new Error(`Scenario '${scenario.name}' requires --confirm; it can stress rasterization resources.`);
    }

    if (scenario.warmupPath) {
        const warm = await runAutocannon({
            url: options.baseUrl,
            requests: [{ path: scenario.warmupPath }],
            connections: 1,
            amount: 1,
            timeout: 120,
            title: `${scenario.name} warmup`,
        });

        if (warm.non2xx > 0 || warm.errors > 0) {
            throw new Error(`Warmup failed: ${warm.non2xx} non-2xx and ${warm.errors} connection errors.`);
        }
    }

    return runAutocannon({
        url: options.baseUrl,
        requests: scenario.requests,
        connections: options.connections,
        ...(options.amount === undefined ? {} : { amount: options.amount }),
        ...(options.duration === undefined ? {} : { duration: options.duration }),
        timeout: 120,
        pipelining: 1,
        title: scenario.name,
    });
}

export function formatResult(result: Result): string {
    const latency = result.latency;
    const requests = result.requests;
    return [
        `Scenario: ${result.title ?? "autocannon"}`,
        `Target: ${result.url}`,
        `Connections: ${result.connections} | Duration: ${result.duration}s | Requests: ${requests.total} (2xx ${result["2xx"]}, 3xx ${result["3xx"]}, 4xx ${result["4xx"]}, 5xx ${result["5xx"]})`,
        `Throughput: ${requests.average.toFixed(1)} req/s average, ${requests.max} req/s max`,
        `Latency: avg ${latency.average} ms, p50 ${latency.p50} ms, p97.5 ${latency.p97_5} ms, p99 ${latency.p99} ms, max ${latency.max} ms`,
        `Errors: ${result.errors} connection errors, ${result.timeouts} timeouts, ${result.non2xx} non-2xx responses`,
    ].join("\n");
}

export function formatHelp(): string {
    return [
        "FLIP API benchmark (autocannon)",
        "",
        "Usage:",
        "  pnpm bench -- --scenario health --base http://127.0.0.1:3029",
        "  pnpm bench -- --scenario webp-cold --base http://127.0.0.1:3029 --connections 100 --amount 100 --confirm",
        "",
        `Scenarios: ${SCENARIOS.map(item => `${item.name} (${item.description})`).join("\n  ")}`,
        "",
        "Options: --base URL --scenario NAME --connections N --amount N | --duration SECONDS --confirm --help",
        "Safety: defaults to low-load local health checks; remote targets and raster workloads require --confirm.",
    ].join("\n");
}

async function main(): Promise<void> {
    const options = parseBenchArgs(process.argv.slice(2));

    if (options.help) {
        console.log(formatHelp());
        return;
    }

    const result = await runBench(options);
    console.log(formatResult(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
