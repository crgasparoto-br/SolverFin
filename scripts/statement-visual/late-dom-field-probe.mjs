/** Inject one late DOM field into a real two-field row, without text collisions. */
export function installLateDomFieldProbe() {
  const form = document.querySelector("[data-group-form]");
  if (!form || document.getElementById("group-negative-late-field")) {
    throw new Error("A unique group form is required for the late-field probe.");
  }
  const fields = Array.from(form.querySelectorAll(":scope > label")).filter((field) => {
    const rect = field.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(field).visibility !== "hidden";
  });
  const rows = [];
  for (const field of fields) {
    const top = field.getBoundingClientRect().top;
    const row = rows.find((item) => Math.abs(item.top - top) <= 4);
    if (row) row.fields.push(field);
    else rows.push({ top, fields: [field] });
  }
  const row = rows.filter((item) => item.fields.length === 2).at(-1);
  if (!row) throw new Error("The late-field probe requires an observed two-field row.");
  const pair = [...row.fields].sort(
    (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left,
  );
  const boxes = pair.map((field) => field.getBoundingClientRect());
  const gap = 12;
  const width = (boxes[1].right - boxes[0].left - gap * 2) / 3;
  if (width < 100) throw new Error("Insufficient room for a discriminating desktop probe.");
  const originalFormStyle = form.getAttribute("style");
  const originalStyles = pair.map((field) => field.getAttribute("style"));
  const originalScroll = { top: form.scrollTop, left: form.scrollLeft };
  const late = document.createElement("label");
  late.id = "group-negative-late-field";
  late.textContent = "Late field";
  const restoreStyle = (element, style) => {
    // Materialize the live CSS declaration before restoring the original attribute.
    element.getAttribute("style");
    if (style === null) element.removeAttribute("style");
    else element.setAttribute("style", style);
  };
  late.restoreProbe = () => {
    pair.forEach((field, index) => restoreStyle(field, originalStyles[index]));
    restoreStyle(form, originalFormStyle);
    late.remove();
    form.scrollTop = originalScroll.top;
    form.scrollLeft = originalScroll.left;
  };
  try {
    form.style.position = "relative";
    pair.forEach((field, index) => {
      field.style.setProperty("box-sizing", "border-box", "important");
      field.style.setProperty("width", `${width}px`, "important");
      field.style.setProperty("position", "relative", "important");
      field.style.setProperty(
        "left",
        `${boxes[0].left + index * (width + gap) - boxes[index].left}px`,
        "important",
      );
    });
    const first = pair[0].getBoundingClientRect();
    const bounds = form.getBoundingClientRect();
    late.style.cssText = `position:absolute;box-sizing:border-box;top:${first.top - bounds.top + form.scrollTop - form.clientTop}px;left:${first.left - bounds.left + form.scrollLeft - form.clientLeft + 2 * (width + gap)}px;width:${width}px`;
    form.append(late);
  } catch (error) {
    late.restoreProbe();
    throw error;
  }
}
