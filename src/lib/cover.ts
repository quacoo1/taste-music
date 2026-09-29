/** Renders an on-page SVG (the generative cover) to a base64 JPEG under Spotify's 256 KB cover limit. */
export async function svgToJpegBase64(svg: SVGSVGElement, size = 640): Promise<string | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Cover render failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    for (const quality of [0.9, 0.8, 0.7, 0.55, 0.4]) {
      const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (b64.length < 250_000) return b64;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
