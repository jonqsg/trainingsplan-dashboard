// Zentrale Anlaufstelle für Netlify Blobs.
// connectLambda(event) ist für Functions im Lambda-Kompatibilitätsmodus
// (exports.handler) nötig, damit getStore() den Blob-Kontext kennt.
const { getStore, connectLambda } = require("@netlify/blobs");

function planStore(event) {
  if (event && event.blobs && typeof connectLambda === "function") connectLambda(event);
  return getStore("training-plan");
}

module.exports = { planStore };
