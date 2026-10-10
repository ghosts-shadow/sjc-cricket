import { describe, expect, it } from "vitest";
import { formatStamp, fromDubaiInputs, timeChangeText } from "./format";

const at = (date: string, time: string) => fromDubaiInputs(date, time).toISOString();

describe("formatStamp", () => {
  it("uses the 12-hour clock in UAE time, like match times", () => {
    expect(formatStamp(at("2026-10-08", "00:52")).replace(/ /g, " ")).toBe("Thu 8 Oct, 12:52 am");
    expect(formatStamp(at("2026-10-10", "17:42")).replace(/ /g, " ")).toBe("Sat 10 Oct, 5:42 pm");
  });
});

describe("timeChangeText", () => {
  it("is null for a match at its original time", () => {
    expect(timeChangeText(at("2026-10-10", "17:00"), null)).toBeNull();
    expect(timeChangeText(at("2026-10-10", "17:00"), at("2026-10-10", "17:00"))).toBeNull();
  });

  it("describes a same-day delay or earlier start in minutes, in UAE time", () => {
    expect(timeChangeText(at("2026-10-10", "17:20"), at("2026-10-10", "17:00"))).toBe("Delayed 20 min (was 5:00 PM)");
    expect(timeChangeText(at("2026-10-10", "16:45"), at("2026-10-10", "17:00"))).toBe("Brought forward 15 min (was 5:00 PM)");
  });

  it("calls same-day moves of over an hour a reschedule (e.g. swapped slots)", () => {
    expect(timeChangeText(at("2026-10-10", "18:40"), at("2026-10-10", "16:20"))).toBe("Rescheduled (was 4:20 PM)");
    expect(timeChangeText(at("2026-10-10", "18:00"), at("2026-10-10", "17:00"))).toBe("Delayed 60 min (was 5:00 PM)");
  });

  it("names the original day when the match moved to another day", () => {
    expect(timeChangeText(at("2026-11-01", "19:00"), at("2026-10-04", "19:00"))).toBe("Moved from Sun 4 Oct, 7:00 PM");
  });
});
