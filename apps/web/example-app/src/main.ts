import { buildSearchPreview } from "./search-preview";

const mount = document.querySelector("#app");
if (mount instanceof HTMLElement) {
  const preview = buildSearchPreview("Example Query");
  const heading = document.createElement("h1");
  heading.textContent = preview.heading;
  const list = document.createElement("ul");
  for (const title of preview.resultTitles) {
    const item = document.createElement("li");
    item.textContent = title;
    list.append(item);
  }
  mount.append(heading);
  mount.append(list);
}
