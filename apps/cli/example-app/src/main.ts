import { formatSearchReport } from "./search-report.js";

const firstQueryArgumentIndex = 2;
const rawText = process.argv.slice(firstQueryArgumentIndex).join(" ");
const report = formatSearchReport(rawText);
console.log(report);
