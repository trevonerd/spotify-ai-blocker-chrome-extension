import { describe, expect, it } from "vitest";
import { escHtml } from "./html";

describe("escHtml", () => {
  it("returns empty string for nullish values", () => {
    expect(escHtml(null)).toBe("");
    expect(escHtml(undefined)).toBe("");
  });

  it("escapes special HTML characters", () => {
    expect(escHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("leaves safe text unchanged", () => {
    expect(escHtml("Hello world")).toBe("Hello world");
  });

  it("handles mixed safe and unsafe characters", () => {
    expect(escHtml("Hello <b>world</b> & friends")).toBe(
      "Hello &lt;b&gt;world&lt;/b&gt; &amp; friends",
    );
  });
});
