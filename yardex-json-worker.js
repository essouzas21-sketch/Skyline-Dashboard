/** Parse JSON pesado fora da thread principal (TV / mobile). */
self.onmessage = (event) => {
  try {
    self.postMessage({ ok: true, data: JSON.parse(event.data) });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || "JSON inválido" });
  }
};
