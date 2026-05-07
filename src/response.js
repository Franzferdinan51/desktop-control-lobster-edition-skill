export function textResult(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

export function jsonResult(value) {
  return textResult(JSON.stringify(value, null, 2));
}

export function imageResult(data, mimeType = 'image/png') {
  return { content: [{ type: 'image', data, mimeType }] };
}

export function errorResult(message) {
  return { isError: true, content: [{ type: 'text', text: String(message) }] };
}
