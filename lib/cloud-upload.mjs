export function createAssetForm(bytes,type,filename) {
  const form = new FormData();
  // Comfy Cloud streams multipart data: metadata MUST precede file bytes.
  form.append('content_type',type);
  form.append('file_path',filename);
  form.append('file',new Blob([bytes],{type}),filename);
  return form;
}
