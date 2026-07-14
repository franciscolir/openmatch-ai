/** Collects only browser-exposed capabilities; no data leaves the device. */
export async function getDeviceProfile() {
  const canvas = document.createElement("canvas");
  const webgl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const battery = navigator.getBattery ? await navigator.getBattery().catch(() => null) : null;
  return {
    cores: navigator.hardwareConcurrency || null,
    memoryGb: navigator.deviceMemory || null,
    webGpu: "gpu" in navigator,
    webGl: Boolean(webgl),
    batteryLevel: battery ? Math.round(battery.level * 100) : null,
    recommendedMode: navigator.hardwareConcurrency >= 8 ? "performance" : "balanced"
  };
}
