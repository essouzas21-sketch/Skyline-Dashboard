/** Parse JSON pesado fora da thread principal (TV / mobile). */
self.onmessage = (event) => {
  const msg = event.data;
  const id = msg && typeof msg === "object" ? msg.id : undefined;
  const text = msg && typeof msg === "object" ? msg.text : msg;
  try {
    self.postMessage({ id, ok: true, data: JSON.parse(text) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || "JSON inválido" });
  }
};
