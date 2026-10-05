import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PatientDisclosure, ReadScope } from "@/domain";
import { SupabaseDatabaseAdapter } from "./database";

interface Request {
  source: string;
  select: string;
}

/**
 * A client that records every `.from(…).select(…)` and answers each request with
 * one canned row, so a read runs all the way through without a database.
 */
function recordingClient(row: Record<string, unknown> | null) {
  const requests: Request[] = [];
  const client = {
    from(source: string) {
      const request: Request = { source, select: "" };
      requests.push(request);
      const builder: Record<string, unknown> = {
        select(columns: string) {
          request.select = columns.replace(/\s+/g, " ");
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      for (const method of ["eq", "or", "gte", "lte", "order", "limit", "range"]) {
        builder[method] = () => builder;
      }
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, requests };
}

const SCOPES: ReadScope[] = [
  { kind: "all" },
  { kind: "organization", organizationId: "00000000-0000-4000-8000-000000000001" },
];

/** Every clinical read the adapter has, run once with `disclosure` in `scope`. */
async function everyClinicalRead(disclosure: PatientDisclosure, scope: ReadScope) {
  const { client, requests } = recordingClient({ session_id: "s", deleted_at: null });
  const db = new SupabaseDatabaseAdapter(client);
  await db.listPatients({ scope, disclosure, search: "Cruz" });
  await db.getPatientRecord("p", scope, disclosure);
  await db.getSessionRecord("s", scope, disclosure);
  await db.getSampleRecord("x", scope, disclosure);
  await db.listSmears({ scope, disclosure });
  return requests;
}

/** Column names that identify a patient, as whole words (`class_label` is not `label`). */
const IDENTITY = /\b(lastname|firstname|middle_name|sex|birthdate|label|user_note)\b/;
const CLINICAL_TABLES = /(^|[\s,(:])(patients|sessions|samples)\s*(!inner\s*)?\(/;

describe("SupabaseDatabaseAdapter — a super admin's reads (D19)", () => {
  for (const scope of SCOPES) {
    it(`never names an identity column (${scope.kind} scope)`, async () => {
      const requests = await everyClinicalRead("deidentified", scope);
      expect(requests.length).toBeGreaterThanOrEqual(5);
      for (const request of requests) expect(request.select).not.toMatch(IDENTITY);
    });

    it(`reads the de-identified views, never the tables (${scope.kind} scope)`, async () => {
      const requests = await everyClinicalRead("deidentified", scope);
      for (const request of requests) {
        expect(request.source).toMatch(/_deidentified$/);
        // Every embed of a clinical table goes to its view, under the table's name.
        expect(request.select).not.toMatch(CLINICAL_TABLES);
      }
    });
  }

  it("does not send a name search", async () => {
    const requests = await everyClinicalRead("deidentified", { kind: "all" });
    expect(requests.some((request) => request.select.includes("Cruz"))).toBe(false);
  });
});

describe("SupabaseDatabaseAdapter — an organization admin's reads", () => {
  it("reads the tables, identified", async () => {
    const requests = await everyClinicalRead("identified", SCOPES[1]);
    for (const request of requests) expect(request.source).not.toMatch(/_deidentified/);
    const patientRead = requests.find((request) => request.source === "patients");
    expect(patientRead?.select).toMatch(/\blastname\b/);
    const sessionRead = requests.find((request) => request.source === "sessions");
    expect(sessionRead?.select).toMatch(/\blabel\b/);
    expect(sessionRead?.select).toMatch(/\buser_note\b/);
  });
});

interface Call {
  method: string;
  args: unknown[];
}

/**
 * A client that records every builder call per request and answers each request
 * from `answers`, in order, so a paged read can be checked call by call.
 */
function scriptedClient(answers: { data?: unknown; error?: unknown; count?: number | null }[]) {
  const requests: { source: string; calls: Call[] }[] = [];
  const client = {
    from(source: string) {
      const request = { source, calls: [] as Call[] };
      requests.push(request);
      const answer = answers[requests.length - 1] ?? {};
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, count: null, ...answer }).then(resolve),
      };
      for (const method of ["select", "eq", "or", "order", "range"]) {
        builder[method] = (...args: unknown[]) => {
          request.calls.push({ method, args });
          return builder;
        };
      }
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, requests };
}

const callsTo = (calls: Call[], method: string) =>
  calls.filter((call) => call.method === method).map((call) => call.args);

describe("SupabaseDatabaseAdapter.listPatients — one page at a time", () => {
  const scope = SCOPES[1];

  it("reads the asked-for page with an exact count, in a total order", async () => {
    const { client, requests } = scriptedClient([{ data: [], count: 1234 }]);
    const page = await new SupabaseDatabaseAdapter(client).listPatients({
      scope,
      disclosure: "identified",
      offset: 100,
      limit: 50,
    });

    expect(page).toEqual({ items: [], total: 1234 });
    const { calls } = requests[0];
    expect(callsTo(calls, "select")[0][1]).toEqual({ count: "exact" });
    expect(callsTo(calls, "range")).toEqual([[100, 149]]);
    expect(callsTo(calls, "order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("defaults to a page of 50 and never asks past the server's row cap", async () => {
    const { client, requests } = scriptedClient([{ data: [] }, { data: [] }]);
    const db = new SupabaseDatabaseAdapter(client);
    await db.listPatients({ scope, disclosure: "identified" });
    await db.listPatients({ scope, disclosure: "identified", limit: 5000 });

    expect(callsTo(requests[0].calls, "range")).toEqual([[0, 49]]);
    expect(callsTo(requests[1].calls, "range")).toEqual([[0, 999]]);
  });

  it("answers a page past the end with the count alone, filtered the same way", async () => {
    const { client, requests } = scriptedClient([
      { error: { code: "PGRST103", message: "Requested range not satisfiable" } },
      { count: 1001 },
    ]);
    const page = await new SupabaseDatabaseAdapter(client).listPatients({
      scope,
      disclosure: "identified",
      search: "Cruz",
      barangayCode: "0722217001",
      offset: 5000,
    });

    expect(page).toEqual({ items: [], total: 1001 });
    expect(requests).toHaveLength(2);
    const [pageRead, countRead] = requests.map((request) => request.calls);
    expect(callsTo(countRead, "select")[0][1]).toEqual({ count: "exact", head: true });
    for (const method of ["eq", "or"]) {
      expect(callsTo(countRead, method)).toEqual(callsTo(pageRead, method));
    }
    expect(callsTo(countRead, "eq")).toContainEqual(["psgc_barangay_code", "0722217001"]);
    expect(callsTo(countRead, "eq")).toContainEqual([
      "patient_organizations.organization_id",
      scope.kind === "organization" ? scope.organizationId : "",
    ]);
  });

  it("still fails loudly on any other error", async () => {
    const { client } = scriptedClient([{ error: { code: "42501", message: "denied" } }]);
    await expect(
      new SupabaseDatabaseAdapter(client).listPatients({ scope, disclosure: "identified" }),
    ).rejects.toThrow("listPatients");
  });
});
