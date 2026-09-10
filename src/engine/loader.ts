export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

const GP_EXTENSIONS = ['.gp', '.gp3', '.gp4', '.gp5', '.gpx'];

export function isGuitarProFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return GP_EXTENSIONS.some((ext) => name.endsWith(ext));
}
