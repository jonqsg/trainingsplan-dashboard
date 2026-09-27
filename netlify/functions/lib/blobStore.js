// Zentrale Anlaufstelle für Netlify Blobs.
// Später erweiterbar: z.B. pro-Nutzer-Keys statt eines einzigen "plan.json",
// sobald mehr als ein Athlet das Dashboard nutzt.
const { getStore } = require("@netlify/blobs");

function planStore() {
  return getStore("training-plan");
}

module.exports = { planStore };
