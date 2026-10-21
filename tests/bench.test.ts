import { describe, expect, it } from "vitest";
import {
    formatHelp,
    formatResult,
    getScenario,
    isLoopbackTarget,
    parseBenchArgs,
    runBench,
    type ScenarioName,
} from "../scripts/bench.ts";
import type { Result } from "autocannon";

describe("benchmark CLI argument parsing and safety", () => {
    it("parses default options correctly", () => {
        const opts = parseBenchArgs([]);
        expect(opts.baseUrl).toBe("http://127.0.0.1:3029");
        expect(opts.scenario).toBe("health");
        expect(opts.connections).toBe(10);
        expect(opts.amount).toBe(100);
        expect(opts.duration).toBeUndefined();
        expect(opts.confirmed).toBe(false);
        expect(opts.help).toBe(false);
    });

    it("handles arguments forwarded through pnpm with -- prefix", () => {
        const opts = parseBenchArgs([
            "--",
            "--base",
            "http://localhost:3029",
            "--scenario",
            "svg-cached",
            "--connections",
            "25",
            "--duration",
            "10",
            "--confirm",
        ]);

        expect(opts.baseUrl).toBe("http://localhost:3029");
        expect(opts.scenario).toBe("svg-cached");
        expect(opts.connections).toBe(25);
        expect(opts.duration).toBe(10);
        expect(opts.amount).toBeUndefined();
        expect(opts.confirmed).toBe(true);
    });

    it("rejects invalid URLs, credentials, or unknown scenarios", () => {
        expect(() => parseBenchArgs(["--base", "ftp://example.com"])).toThrow("HTTP or HTTPS");
        expect(() => parseBenchArgs(["--base", "https://user:pass@example.com"])).toThrow("Credentials");
        expect(() => parseBenchArgs(["--scenario", "unknown-scenario"])).toThrow("Unknown scenario");
        expect(() => parseBenchArgs(["--connections", "0"])).toThrow("Connections");
        expect(() => parseBenchArgs(["--connections", "500"])).toThrow("Connections");
        expect(() => parseBenchArgs(["--amount", "10", "--duration", "5"])).toThrow("Specify exactly one");
    });

    it("detects loopback targets correctly", () => {
        expect(isLoopbackTarget("http://localhost:3029")).toBe(true);
        expect(isLoopbackTarget("http://127.0.0.1:3029")).toBe(true);
        expect(isLoopbackTarget("http://[::1]:3029")).toBe(true);
        expect(isLoopbackTarget("https://flip.taruna.me")).toBe(false);
        expect(isLoopbackTarget("https://example.com")).toBe(false);
    });

    it("retrieves valid scenarios and throws on invalid names", () => {
        const scenario = getScenario("svg-cached");
        expect(scenario.name).toBe("svg-cached");
        expect(scenario.requests.length).toBeGreaterThan(0);
        expect(() => getScenario("invalid" as unknown as ScenarioName)).toThrow("Unknown scenario");
    });

    it("enforces confirmation gates for remote targets and heavy scenarios", async () => {
        await expect(runBench({
            baseUrl: "https://flip.taruna.me",
            scenario: "health",
            connections: 5,
            amount: 10,
            confirmed: false,
        })).rejects.toThrow("Refusing remote target");

        await expect(runBench({
            baseUrl: "http://127.0.0.1:3029",
            scenario: "webp-cold",
            connections: 5,
            amount: 10,
            confirmed: false,
        })).rejects.toThrow("requires --confirm");
    });

    it("formats benchmark help and results cleanly", () => {
        const help = formatHelp();
        expect(help).toContain("FLIP API benchmark (autocannon)");
        expect(help).toContain("svg-cached");

        const mockResult: Result = {
            "title": "health",
            "url": "http://127.0.0.1:3029",
            "socketPath": undefined,
            "connections": 10,
            "pipelining": 1,
            "duration": 1.05,
            "start": new Date(),
            "finish": new Date(),
            "errors": 0,
            "timeouts": 0,
            "mismatches": 0,
            "non2xx": 0,
            "resets": 0,
            "1xx": 0,
            "2xx": 100,
            "3xx": 0,
            "4xx": 0,
            "5xx": 0,
            "requests": {
                total: 100,
                average: 95.2,
                mean: 95.2,
                stddev: 0,
                min: 95,
                max: 100,
                p0_001: 95,
                p0_01: 95,
                p0_1: 95,
                p1: 95,
                p2_5: 95,
                p10: 95,
                p25: 95,
                p50: 95,
                p75: 100,
                p90: 100,
                p97_5: 100,
                p99: 100,
                p99_9: 100,
                p99_99: 100,
                p99_999: 100,
                sent: 100,
            },
            "latency": {
                total: 100,
                average: 2.5,
                mean: 2.5,
                stddev: 0.5,
                min: 1,
                max: 8,
                p0_001: 1,
                p0_01: 1,
                p0_1: 1,
                p1: 1,
                p2_5: 1,
                p10: 1,
                p25: 2,
                p50: 2,
                p75: 3,
                p90: 4,
                p97_5: 6,
                p99: 7,
                p99_9: 8,
                p99_99: 8,
                p99_999: 8,
            },
            "throughput": {
                total: 10000,
                average: 10000,
                mean: 10000,
                stddev: 0,
                min: 10000,
                max: 10000,
                p0_001: 10000,
                p0_01: 10000,
                p0_1: 10000,
                p1: 10000,
                p2_5: 10000,
                p10: 10000,
                p25: 10000,
                p50: 10000,
                p75: 10000,
                p90: 10000,
                p97_5: 10000,
                p99: 10000,
                p99_9: 10000,
                p99_99: 10000,
                p99_999: 10000,
            },
        };

        const formatted = formatResult(mockResult);
        expect(formatted).toContain("Scenario: health");
        expect(formatted).toContain("Throughput: 95.2 req/s average");
        expect(formatted).toContain("Latency: avg 2.5 ms, p50 2 ms");
    });
});
