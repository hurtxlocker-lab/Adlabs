import { describe, expect, it } from "vitest";
import {
  extractSupabaseProjectRef,
  redactProjectRef,
  TargetSafetyError,
  verifyDatabaseTargetSafety,
} from "../target-safety";

describe("Database Target Safety", () => {
  const secretPassword = "super_secret_password_12345";
  const samplePoolerUrl = `postgresql://postgres.abcdefghijklmnop:${secretPassword}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`;
  const sampleDirectUrl = `postgresql://postgres:${secretPassword}@db.abcdefghijklmnop.supabase.co:5432/postgres`;

  describe("redactProjectRef", () => {
    it("should redact project ref to first 3 and last 3 characters", () => {
      expect(redactProjectRef("abcdefghijklmnop")).toBe("abc…nop");
      expect(redactProjectRef("1234567890")).toBe("123…890");
    });

    it("should return *** for short strings", () => {
      expect(redactProjectRef("abc")).toBe("***");
      expect(redactProjectRef("123456")).toBe("***");
    });
  });

  describe("extractSupabaseProjectRef", () => {
    it("should extract project ref from Supabase pooler username format (postgres.<project-ref>)", () => {
      expect(extractSupabaseProjectRef(samplePoolerUrl)).toBe(
        "abcdefghijklmnop",
      );
    });

    it("should extract project ref from direct Supabase host format", () => {
      expect(extractSupabaseProjectRef(sampleDirectUrl)).toBe(
        "abcdefghijklmnop",
      );
    });

    it("should fail closed and not guess when username is unrelated or generic", () => {
      const genericUrl = `postgresql://postgres:${secretPassword}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
      expect(() => extractSupabaseProjectRef(genericUrl)).toThrow(
        TargetSafetyError,
      );
      expect(() => extractSupabaseProjectRef(genericUrl)).toThrow(
        /Could not determine Supabase project reference/i,
      );
    });

    it("should fail on invalid URL", () => {
      expect(() => extractSupabaseProjectRef("not-a-url")).toThrow(
        TargetSafetyError,
      );
      expect(() =>
        extractSupabaseProjectRef("http://localhost:5432/postgres"),
      ).toThrow(/invalid protocol/i);
    });
  });

  describe("verifyDatabaseTargetSafety", () => {
    it("should succeed when project ref matches expected SUPABASE_PROJECT_REF", () => {
      const result = verifyDatabaseTargetSafety(
        samplePoolerUrl,
        "abcdefghijklmnop",
      );
      expect(result.matchesExpected).toBe(true);
      expect(result.projectRef).toBe("abcdefghijklmnop");
      expect(result.redactedProjectRef).toBe("abc…nop");
      expect(result.host).toBe("aws-0-ap-south-1.pooler.supabase.com");
      expect(result.port).toBe("5432");
      expect(result.database).toBe("postgres");
      expect(result.sslStatus).toBe("required (non-localhost host — postgres.js auto-enables SSL)");
    });

    it("should fail closed when expected project ref does not match", () => {
      let errorThrown: TargetSafetyError | null = null;
      try {
        verifyDatabaseTargetSafety(samplePoolerUrl, "wrong_project_ref");
      } catch (err) {
        if (err instanceof TargetSafetyError) {
          errorThrown = err;
        }
      }

      expect(errorThrown).not.toBeNull();
      expect(errorThrown?.message).toContain("Database target mismatch");
      // Must NOT contain password
      expect(errorThrown?.message).not.toContain(secretPassword);
    });

    it("should fail closed when SUPABASE_PROJECT_REF is missing or empty", () => {
      expect(() =>
        verifyDatabaseTargetSafety(samplePoolerUrl, undefined),
      ).toThrow(/SUPABASE_PROJECT_REF is not configured/i);

      expect(() =>
        verifyDatabaseTargetSafety(samplePoolerUrl, "   "),
      ).toThrow(/SUPABASE_PROJECT_REF is not configured/i);
    });

    it("should never include secret credentials in error messages", () => {
      try {
        verifyDatabaseTargetSafety(
          `postgresql://postgres.abcdefghijklmnop:${secretPassword}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
          "mismatched_ref_value",
        );
      } catch (err) {
        if (err instanceof Error) {
          expect(err.message).not.toContain(secretPassword);
          expect(err.message).not.toContain("postgresql://");
        }
      }
    });
  });
});
