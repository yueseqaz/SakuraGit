// Prism's built-in JSON message protocol must not consume our structured-clone messages.
Object.assign(globalThis, { Prism: { disableWorkerMessageHandler: true } });
