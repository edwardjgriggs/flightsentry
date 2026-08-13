import { describe, expect, it } from "vitest";

import { buildGraniteMessages, parseGraniteContent } from "@/lib/granite-prompt";
import { getScenario } from "@/lib/scenarios";

describe("Granite prompt boundary", () => {
  it("includes trusted evidence identifiers and forbids command execution", () => {
    const messages = buildGraniteMessages(getScenario("esa-m2-609"));
    const prompt = messages.map((message) => message.content).join("\n");

    expect(prompt).toContain("tc-609-recorded");
    expect(prompt).toMatch(/never issue or execute spacecraft commands/i);
    expect(prompt).toMatch(/INVESTIGATE/i);
  });

  it("system prompt requires verified context before MONITOR", () => {
    const messages = buildGraniteMessages(getScenario("esa-m2-609"));
    const systemContent = messages.find((m) => m.role === "system")?.content ?? "";
    // The system prompt must instruct the model that MONITOR requires verified context
    expect(systemContent).toMatch(/MONITOR requires both a trusted telecommand record and an overlapping planned-event record/i);
    expect(systemContent).toMatch(/Missing operational context alone requires INVESTIGATE, not ESCALATE/i);
  });

  it("user content includes all evidence IDs from the scenario", () => {
    const scenario = getScenario("esa-m2-609");
    const messages = buildGraniteMessages(scenario);
    const userContent = messages.find((m) => m.role === "user")?.content ?? "";
    for (const item of scenario.evidence) {
      expect(userContent).toContain(item.id);
    }
  });

  it("extracts JSON from a fenced model response", () => {
    const expected = { disposition: "INVESTIGATE", summary: "Check context" };
    expect(
      parseGraniteContent(`Here is the result:\n\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``),
    ).toEqual(expected);
  });

  it("extracts JSON when the model adds prose after the closing brace", () => {
    const expected = { disposition: "MONITOR", summary: "Looks normal" };
    const content = `${JSON.stringify(expected)}\n\nHope this helps!`;
    expect(parseGraniteContent(content)).toEqual(expected);
  });

  it("rejects responses without a JSON object", () => {
    expect(() => parseGraniteContent("I cannot comply.")).toThrow(/JSON object/i);
  });

  it("rejects an empty string response", () => {
    expect(() => parseGraniteContent("")).toThrow(/JSON object/i);
  });
});
