import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { rupees } from "../packages/api-client/src/index";
import { hindiMessages } from "../apps/web/app/hindi-messages";
import {
  translateText,
  translateError,
  nativeValidationText,
  curriculumText,
} from "../apps/web/app/locale";

test("all literal interface translation calls have Hindi entries and preserve interpolation slots", () => {
  const missing: string[] = [];
  const roots = ["apps/web/app", "apps/web/components/ui"];
  for (const root of roots)
    for (const name of readdirSync(root).filter((n) => n.endsWith(".tsx"))) {
      const file = ts.createSourceFile(
        name,
        readFileSync(`${root}/${name}`, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(file) === "appText" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const value = node.arguments[0].text;
          if (/[A-Za-z]/.test(value) && !Object.hasOwn(hindiMessages, value))
            missing.push(`${name}: ${value}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
  assert.deepEqual(missing, []);
  for (const [english, hindi] of Object.entries(hindiMessages)) {
    assert.equal(typeof hindi, "string", english);
    const slots = (text: string) =>
      [...new Set(text.match(/\{\d+\}/g) || [])].sort();
    assert.deepEqual(slots(hindi), slots(english), english);
  }
});

test("localized presentation preserves English, authored values, nodes and prototype keys", () => {
  assert.equal(translateText(false, "Class {0}", [8]), "Class 8");
  assert.equal(translateText(true, "Class {0}", [8]), "कक्षा 8");
  assert.equal(translateText(true, "Class 8 · CBSE"), "कक्षा 8 · CBSE");
  assert.equal(translateText(true, "HOME"), "घर पर");
  assert.equal(translateText(true, "in progress"), "समीक्षा जारी");
  assert.equal(
    translateText(true, "View {0}", ["Open {0} <script>"]),
    "Open {0} <script> देखें",
  );
  assert.equal(
    translateText(false, "A literal {0} in authored text"),
    "A literal {0} in authored text",
  );
  const node = { type: "synthetic-element", props: { children: "Open" } };
  assert.equal(translateText(true, node), node);
  for (const text of [
    "constructor",
    "__proto__",
    "toString",
    "Synthetic authored evidence",
  ])
    assert.equal(translateText(true, text), text);
  assert.equal(translateError(true, ""), "");
  assert.equal(translateError(true, "कृपया नाम भरें।"), "कृपया नाम भरें।");
  assert.equal(translateError(true, "Enter your city."), "अपना शहर दर्ज करें।");
  for (const message of [
    "Access changed since this decision was recorded. Reload the current record before retrying.",
    "Your access changed. Sign in again.",
    "Shared note not found.",
    "Sharing requires an active placement with this teacher.",
  ]) {
    assert.equal(translateError(false, message), message);
    assert.equal(translateError(true, message), hindiMessages[message]);
    assert.match(translateError(true, message), /[\u0900-\u097F]/);
  }
  assert.equal(
    translateError(true, "Unknown private backend detail"),
    "यह कार्रवाई पूरी नहीं हुई। मौजूदा जानकारी और अपनी अनुमति जाँचें, फिर कोशिश करें।",
  );
});

test("native Hindi validation gives recoverable required and format guidance", () => {
  const valid = {
    valueMissing: false,
    typeMismatch: false,
    rangeUnderflow: false,
    rangeOverflow: false,
    tooShort: false,
    tooLong: false,
    patternMismatch: false,
    stepMismatch: false,
  };
  assert.equal(
    nativeValidationText({ ...valid, valueMissing: true }),
    "यह जानकारी भरें।",
  );
  assert.match(nativeValidationText({ ...valid, typeMismatch: true }), /ईमेल/);
  assert.match(nativeValidationText({ ...valid, rangeOverflow: true }), /सीमा/);
});

test("rendered conditional branches and button-label arrays cannot introduce untranslated literals", () => {
  const failures: string[] = [];
  for (const name of readdirSync("apps/web/app").filter((n) =>
    n.endsWith(".tsx"),
  )) {
    const file = ts.createSourceFile(
      name,
      readFileSync(`apps/web/app/${name}`, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const report = (node: ts.Node, value: string) =>
      failures.push(
        `${name}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${value}`,
      );
    function display(node: ts.Expression) {
      if (ts.isStringLiteral(node) && /[A-Za-z]/.test(node.text))
        report(node, node.text);
      else if (
        ts.isCallExpression(node) &&
        ["pretty", "label"].includes(node.expression.getText(file))
      )
        report(node, "untranslated structured status");
      else if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) {
          const expression = span.expression;
          if (
            ts.isCallExpression(expression) &&
            ["pretty", "label"].includes(expression.expression.getText(file))
          )
            report(expression, "untranslated structured status");
        }
      } else if (ts.isParenthesizedExpression(node)) display(node.expression);
      else if (ts.isConditionalExpression(node)) {
        display(node.whenTrue);
        display(node.whenFalse);
      } else if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
          display(node.left);
        display(node.right);
      } else if (
        ts.isElementAccessExpression(node) &&
        ts.isArrayLiteralExpression(node.expression) &&
        node.expression.elements.some(
          (e) => ts.isStringLiteral(e) && /[A-Za-z]/.test(e.text),
        )
      )
        report(node, "untranslated label array");
    }
    function visit(node: ts.Node) {
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        !ts.isJsxAttribute(node.parent)
      )
        display(node.expression);
      if (
        ts.isJsxText(node) &&
        /[A-Za-z]/.test(node.text) &&
        !["Language / भाषा", "English"].includes(node.text.trim())
      )
        report(node, node.text.trim());
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  assert.deepEqual(failures, []);
});

test("declared curriculum labels translate without rewriting custom subjects or currency amounts", () => {
  const hi = (value: string) => translateText(true, value);
  assert.equal(curriculumText("Maths", hi), "गणित");
  assert.equal(curriculumText("Hindi", hi), "हिन्दी");
  assert.equal(curriculumText("Open", hi), "Open");
  assert.equal(
    curriculumText("Synthetic quantum studio", hi),
    "Synthetic quantum studio",
  );
  assert.equal(
    rupees(1234500, "hi-IN"),
    new Intl.NumberFormat("hi-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(12345),
  );
  assert.equal(rupees(1234500), rupees(1234500, "en-IN"));
});
