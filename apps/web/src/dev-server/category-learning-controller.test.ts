import { categoryLearningControllerScript } from "./category-learning-controller.js";

const script = categoryLearningControllerScript();

assertIncludes(script, "/api/category-learning/apply", "categorization apply action");
assertIncludes(script, "/api/category-learning?status=all", "learning list action");
assertIncludes(script, 'action !== "ignore" && action !== "revert"', "learning action guard");
assertIncludes(script, '"/" + action', "learning action endpoint");
assertIncludes(script, 'ignoreButton.dataset.learningAction = "ignore"', "learning ignore action");
assertIncludes(script, 'revertButton.dataset.learningAction = "revert"', "learning revert action");
assertIncludes(script, "correção anterior", "learning origin label");
assertIncludes(script, "origem ", "inbox origin presentation");
assertIncludes(script, "Corrigir e aprovar", "correction approval action");
assertIncludes(
  script,
  "payloadOverride: { categoryId: select.value }",
  "category override payload",
);
assertIncludes(script, "aria-live", "accessible async feedback");
assertIncludes(script, "showModal", "focused correction dialog");

function assertIncludes(value: string, expected: string, message: string): void {
  if (!value.includes(expected)) {
    throw new Error(`${message}. Missing ${expected}.`);
  }
}
